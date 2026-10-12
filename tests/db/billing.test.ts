// @vitest-environment node
// Abonnements : seul le webhook Stripe vérifié modifie les droits.
// Les événements sont signés comme le ferait Stripe (HMAC-SHA256).
import { createHmac, randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers'

config({ path: '.env.local', quiet: true })
const URL_WEBHOOK = `${process.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!

let user: TestUser
const customer = `cus_test${Date.now()}`
const subId = `sub_test${Date.now()}`
const now = Math.floor(Date.now() / 1000)

async function send(event: Record<string, unknown>, sign = true) {
  const payload = JSON.stringify({ object: 'event', api_version: '2025-01-27.acacia', created: now, livemode: false, ...event })
  const t = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')
  const res = await fetch(URL_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(sign ? { 'stripe-signature': `t=${t},v1=${signature}` } : { 'stripe-signature': `t=${t},v1=${'0'.repeat(64)}` }) },
    body: payload,
  })
  return { status: res.status, body: await res.json() }
}

const subscription = (status: string, extra: Record<string, unknown> = {}) => ({
  id: subId,
  object: 'subscription',
  customer,
  status,
  cancel_at_period_end: false,
  canceled_at: null,
  current_period_end: now + 30 * 86400,
  metadata: { user_id: user.id, plan_id: 'premium' },
  items: { data: [{ price: { id: 'price_test_inconnu', recurring: { interval: 'month' } }, current_period_end: now + 30 * 86400 }] },
  ...extra,
})

const entitlements = async () => (await user.client.rpc('my_entitlements')).data as { plan: string; limits: Record<string, unknown> }

beforeAll(async () => {
  user = await createTestUser('billing')
}, 30_000)

afterAll(async () => {
  await deleteTestUser(user)
}, 30_000)

describe('offre gratuite et limites appliquées par la base', () => {
  it('un nouvel utilisateur est sur l’offre Découverte', async () => {
    expect(await entitlements()).toMatchObject({ plan: 'free', limits: { max_goals: 1, coach_questions_per_month: 0 } })
  })

  it('la limite d’objectifs est appliquée côté base', async () => {
    expect((await user.client.from('savings_goals').insert({ name: 'Premier', target_cents: 100000 })).error).toBeNull()
    const second = await user.client.from('savings_goals').insert({ name: 'Second', target_cents: 100000 })
    expect(second.error?.message).toBe('plan_limit_goals')
  })

  it('le client ne peut pas s’attribuer un abonnement ni un client Stripe', async () => {
    const sub = await user.client.from('subscriptions').insert({ user_id: user.id, stripe_subscription_id: 'sub_fraude', plan_id: 'premium', status: 'active', billing_interval: 'month' })
    expect(sub.error).not.toBeNull()
    expect((await user.client.from('billing_customers').insert({ user_id: user.id, stripe_customer_id: 'cus_fraude' })).error).not.toBeNull()
    expect((await entitlements()).plan).toBe('free')
  })

  it('la souscription exige la demande expresse d’accès immédiat (droit de rétractation)', async () => {
    const r = await user.client.functions.invoke('billing-checkout', { body: { interval: 'month' } })
    expect(await (r.error as { context: Response }).context.json()).toMatchObject({ error: { code: 'consent_required' } })
  })

  it('le paiement en ligne indique clairement s’il n’est pas encore configuré', async () => {
    const r = await user.client.functions.invoke('billing-checkout', { body: { interval: 'month', immediateStart: true } })
    expect(r.error).not.toBeNull()
    expect(await (r.error as { context: Response }).context.json()).toMatchObject({ error: { code: 'billing_not_configured' } })
  })
})

describe('webhook Stripe', () => {
  it('rejette un appel non signé ou mal signé', async () => {
    expect((await send({ id: `evt_${randomUUID()}`, type: 'customer.subscription.created', data: { object: {} } }, false)).status).toBe(400)
    const res = await fetch(URL_WEBHOOK, { method: 'POST', body: '{}' })
    expect(res.status).toBe(400)
    expect((await entitlements()).plan).toBe('free')
  })

  it('checkout terminé puis abonnement actif : les droits Premium sont ouverts', async () => {
    expect((await send({ id: `evt_${randomUUID()}`, type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', object: 'checkout.session', customer, client_reference_id: user.id, metadata: { user_id: user.id } } } })).status).toBe(200)
    const { data: cust } = await admin.from('billing_customers').select('stripe_customer_id').eq('user_id', user.id).single()
    expect(cust?.stripe_customer_id).toBe(customer)

    const evt = `evt_${randomUUID()}`
    expect((await send({ id: evt, type: 'customer.subscription.created', data: { object: subscription('active') } })).status).toBe(200)
    expect(await entitlements()).toMatchObject({ plan: 'premium', limits: { max_goals: 20 } })
    expect((await user.client.from('savings_goals').insert({ name: 'Second', target_cents: 100000 })).error).toBeNull()

    // Idempotence : le même événement renvoyé n'est traité qu'une fois.
    expect((await send({ id: evt, type: 'customer.subscription.created', data: { object: subscription('active') } })).body).toMatchObject({ duplicate: true })
    const { data: notes } = await user.client.from('notifications').select('kind')
    expect(notes!.filter((n) => n.kind === 'billing.active')).toHaveLength(1)
  })

  it('paiement réussi puis échoué : facture enregistrée, notification, droits conservés pendant les relances', async () => {
    const invoice = (id: string, extra: Record<string, unknown>) => ({ id, object: 'invoice', customer, subscription: subId, currency: 'eur', hosted_invoice_url: 'https://invoice.stripe.com/i/test', invoice_pdf: 'https://pay.stripe.com/invoice/test/pdf', payment_intent: 'pi_test_1', lines: { data: [{ period: { start: now, end: now + 30 * 86400 } }] }, ...extra })
    expect((await send({ id: `evt_${randomUUID()}`, type: 'invoice.paid', data: { object: invoice('in_test_paid', { amount_paid: 599 }) } })).status).toBe(200)
    expect((await send({ id: `evt_${randomUUID()}`, type: 'invoice.payment_failed', data: { object: invoice('in_test_failed', { amount_due: 599, payment_intent: 'pi_test_2' }) } })).status).toBe(200)
    expect((await send({ id: `evt_${randomUUID()}`, type: 'customer.subscription.updated', data: { object: subscription('past_due') } })).status).toBe(200)

    const { data: payments } = await user.client.from('payments').select('stripe_invoice_id, status, amount_cents').order('stripe_invoice_id')
    expect(payments).toEqual([
      { stripe_invoice_id: 'in_test_failed', status: 'failed', amount_cents: 599 },
      { stripe_invoice_id: 'in_test_paid', status: 'paid', amount_cents: 599 },
    ])
    const { data: notes } = await user.client.from('notifications').select('kind')
    expect(notes!.map((n) => n.kind)).toContain('billing.payment_failed')
    expect((await entitlements()).plan).toBe('premium')
  })

  it('remboursement : le paiement est marqué remboursé', async () => {
    expect((await send({ id: `evt_${randomUUID()}`, type: 'charge.refunded', data: { object: { id: 'ch_test_1', object: 'charge', invoice: 'in_test_paid', amount: 599, amount_refunded: 599 } } })).status).toBe(200)
    const { data } = await user.client.from('payments').select('status, refunded_cents').eq('stripe_invoice_id', 'in_test_paid').single()
    expect(data).toEqual({ status: 'refunded', refunded_cents: 599 })
  })

  it('formule annuelle : changement notifié, puis rappel avant le renouvellement (loi Chatel)', async () => {
    // Paiement régularisé (sortie de l'impayé), puis passage à la formule annuelle
    expect((await send({ id: `evt_${randomUUID()}`, type: 'customer.subscription.updated', data: { object: subscription('active') } })).status).toBe(200)
    const yearly = subscription('active', { items: { data: [{ price: { id: 'price_test_annuel', recurring: { interval: 'year' } }, current_period_end: now + 40 * 86400 }] } })
    expect((await send({ id: `evt_${randomUUID()}`, type: 'customer.subscription.updated', data: { object: yearly } })).status).toBe(200)
    expect((await user.client.from('subscriptions').select('billing_interval').eq('stripe_subscription_id', subId).single()).data?.billing_interval).toBe('year')
    const upcoming = { object: 'invoice', customer, subscription: subId, amount_due: 5990, next_payment_attempt: now + 30 * 86400 }
    expect((await send({ id: `evt_${randomUUID()}`, type: 'invoice.upcoming', data: { object: upcoming } })).status).toBe(200)
    const { data: notes } = await user.client.from('notifications').select('kind, body').in('kind', ['billing.interval_changed', 'billing.renewal_reminder'])
    expect(notes!.map((n) => n.kind).sort()).toEqual(['billing.interval_changed', 'billing.renewal_reminder'])
    expect(notes!.find((n) => n.kind === 'billing.renewal_reminder')!.body).toMatch(/59,90 €.*résilier/)
  })

  it('résiliation en fin de période puis fin d’abonnement : retour à l’offre gratuite', async () => {
    expect((await send({ id: `evt_${randomUUID()}`, type: 'customer.subscription.updated', data: { object: subscription('active', { cancel_at_period_end: true }) } })).status).toBe(200)
    expect((await entitlements()).plan).toBe('premium')
    expect((await send({ id: `evt_${randomUUID()}`, type: 'customer.subscription.deleted', data: { object: subscription('canceled', { current_period_end: now - 60, ended_at: now - 60, items: { data: [{ price: { id: 'price_x', recurring: { interval: 'month' } }, current_period_end: now - 60 }] } }) } })).status).toBe(200)
    expect((await entitlements()).plan).toBe('free')
    // Les objectifs existants sont conservés ; seule la création au-delà de la limite est bloquée.
    expect((await user.client.from('savings_goals').select('id')).data).toHaveLength(2)
  })

  it('une erreur de traitement renvoie 500 pour que Stripe relance l’événement', async () => {
    const evt = `evt_${randomUUID()}`
    const orphan = { ...subscription('active'), customer: 'cus_inconnu', metadata: {} }
    expect((await send({ id: evt, type: 'customer.subscription.created', data: { object: orphan } })).status).toBe(500)
    // Relance : l'événement n'a pas été marqué comme traité.
    expect((await send({ id: evt, type: 'customer.subscription.created', data: { object: orphan } })).status).toBe(500)
  })
})
