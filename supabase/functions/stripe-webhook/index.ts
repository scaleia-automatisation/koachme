// Webhook Stripe : seule source de vérité des droits d'accès payants.
//
// - Signature vérifiée (secret STRIPE_WEBHOOK_SECRET) : tout appel non signé est rejeté.
// - Idempotence : un événement déjà traité est ignoré.
// - Gère : souscription, changement de formule, renouvellement, paiement
//   échoué, annulation, résiliation, remboursement.
// - En cas d'erreur, renvoie 500 pour que Stripe relance l'événement (reprise).
import { json } from '../_shared/http.ts'
import { sendEmail, siteUrl } from '../_shared/email.ts'
import { audit, logEvent } from '../_shared/log.ts'
import { cryptoProvider, stripeClient } from '../_shared/stripe.ts'
import { adminClient } from '../_shared/supabase.ts'

type Db = ReturnType<typeof adminClient>
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
])

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const signature = req.headers.get('stripe-signature')
  if (!secret || !signature) return json({ error: 'signature_missing' }, 400)

  const body = await req.text()
  let event: Obj
  try {
    event = await stripeClient().webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider)
  } catch {
    return json({ error: 'invalid_signature' }, 400)
  }

  const db = adminClient()
  const { data: firstSeen, error: seenError } = await db.rpc('stripe_event_first_seen', { p_id: event.id, p_type: event.type })
  if (seenError) return json({ error: 'storage_error' }, 500)
  if (firstSeen === false) return json({ received: true, duplicate: true })

  try {
    const object = event.data.object as Obj
    if (event.type === 'checkout.session.completed') await onCheckoutCompleted(db, object)
    else if (SUBSCRIPTION_EVENTS.has(event.type)) await onSubscription(db, object, event.type)
    else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') await onInvoice(db, object, 'paid')
    else if (event.type === 'invoice.payment_failed') await onInvoice(db, object, 'failed')
    else if (event.type === 'invoice.voided') await onInvoice(db, object, 'void')
    else if (event.type === 'charge.refunded') await onRefund(db, object)
    else if (event.type === 'invoice.upcoming') await onUpcomingRenewal(db, object)
    return json({ received: true })
  } catch (e) {
    // L'événement sera renvoyé par Stripe : on retire la marque « traité ».
    await db.rpc('stripe_event_forget', { p_id: event.id })
    await logEvent(db, 'error', 'stripe-webhook', event.type, e instanceof Error ? e.message : undefined, { event_id: event.id })
    return json({ error: 'processing_error' }, 500)
  }
})

const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as Obj).id) : null)
const toIso = (s: unknown) => (typeof s === 'number' ? new Date(s * 1000).toISOString() : null)

async function userForCustomer(db: Db, customerId: string | null, metadataUser?: string | null): Promise<string | null> {
  if (metadataUser && /^[0-9a-f-]{36}$/i.test(metadataUser)) return metadataUser
  if (!customerId) return null
  const { data } = await db.from('billing_customers').select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
  return data?.user_id ?? null
}

async function onCheckoutCompleted(db: Db, session: Obj) {
  const userId = session.client_reference_id ?? session.metadata?.user_id
  const customerId = idOf(session.customer)
  if (!userId || !customerId) return
  await db.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' })
  await audit(db, null, 'billing.checkout_completed', userId, { session: session.id })
}

async function planForPrice(db: Db, priceId: string | null): Promise<string | null> {
  if (!priceId) return null
  const { data } = await db.from('plans').select('id').or(`stripe_price_monthly.eq.${priceId},stripe_price_yearly.eq.${priceId}`).maybeSingle()
  return data?.id ?? null
}

async function onSubscription(db: Db, sub: Obj, type: string) {
  const customerId = idOf(sub.customer)
  const userId = await userForCustomer(db, customerId, sub.metadata?.user_id)
  if (!userId) throw new Error('Utilisateur introuvable pour cet abonnement')
  if (customerId) await db.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' })

  const item = sub.items?.data?.[0] ?? {}
  const priceId = idOf(item.price)
  const planId = (await planForPrice(db, priceId)) ?? sub.metadata?.plan_id
  if (!planId) throw new Error('Offre inconnue pour ce prix')

  const status = type === 'customer.subscription.deleted' ? 'canceled' : sub.status
  const { data: previous } = await db
    .from('subscriptions')
    .select('status, plan_id, billing_interval, cancel_at_period_end')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()
  const row = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    plan_id: planId,
    status,
    billing_interval: item.price?.recurring?.interval === 'year' ? 'year' : 'month',
    current_period_end: toIso(sub.current_period_end ?? item.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: toIso(sub.canceled_at ?? sub.ended_at),
  }
  const { error } = await db.from('subscriptions').upsert(row, { onConflict: 'stripe_subscription_id' })
  if (error) throw error

  const changed =
    !previous ||
    previous.status !== status ||
    previous.plan_id !== planId ||
    previous.billing_interval !== row.billing_interval ||
    previous.cancel_at_period_end !== row.cancel_at_period_end
  if (!changed) return

  await audit(db, null, 'billing.subscription_changed', userId, {
    status,
    plan: planId,
    interval: row.billing_interval,
    cancel_at_period_end: row.cancel_at_period_end,
    previous_status: previous?.status ?? null,
  })
  const until = row.current_period_end ? new Date(row.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const message =
    status === 'canceled'
      ? { kind: 'billing.canceled', title: 'Votre abonnement est résilié', body: 'Vous êtes repassé sur l’offre Découverte. Vos données sont conservées.' }
      : row.cancel_at_period_end && !previous?.cancel_at_period_end
        ? { kind: 'billing.cancel_scheduled', title: 'Résiliation enregistrée', body: `Votre abonnement ne sera pas renouvelé. Vous gardez l’accès Premium${until ? ` jusqu’au ${until}` : ' jusqu’à la fin de la période payée'}, sans nouveau prélèvement.` }
        : status === 'active' && previous?.status !== 'active'
          ? { kind: 'billing.active', title: 'Votre abonnement Premium est actif', body: 'Merci ! Toutes les fonctionnalités Premium sont disponibles.' }
          : status === 'active' && previous?.cancel_at_period_end && !row.cancel_at_period_end
            ? { kind: 'billing.cancel_reverted', title: 'Résiliation annulée', body: 'Votre abonnement Premium continue normalement.' }
            : previous && previous.billing_interval !== row.billing_interval
              ? { kind: 'billing.interval_changed', title: 'Formule modifiée', body: `Votre abonnement Premium est désormais ${row.billing_interval === 'year' ? 'annuel' : 'mensuel'}.` }
              : null
  if (!message) return
  await db.from('notifications').insert({ user_id: userId, ...message, link: '/app/abonnement' })
  // Confirmation sur un support durable (souscription, résiliation, changement de formule).
  const { data: user } = await db.auth.admin.getUserById(userId)
  if (user?.user?.email) {
    await sendEmail(user.user.email, `${message.title} — Economiz`, message.title, message.body, { label: 'Voir mon abonnement', url: `${siteUrl()}/app/abonnement` })
  }
}

function subscriptionIdOfInvoice(inv: Obj): string | null {
  return idOf(inv.subscription) ?? idOf(inv.parent?.subscription_details?.subscription) ?? idOf(inv.lines?.data?.[0]?.subscription)
}

async function onInvoice(db: Db, inv: Obj, outcome: 'paid' | 'failed' | 'void') {
  const userId = await userForCustomer(db, idOf(inv.customer), inv.metadata?.user_id ?? inv.subscription_details?.metadata?.user_id ?? inv.parent?.subscription_details?.metadata?.user_id)
  if (!userId) throw new Error('Utilisateur introuvable pour cette facture')
  const subStripeId = subscriptionIdOfInvoice(inv)
  const { data: sub } = subStripeId ? await db.from('subscriptions').select('id').eq('stripe_subscription_id', subStripeId).maybeSingle() : { data: null }
  const line = inv.lines?.data?.[0]
  const paymentIntent = idOf(inv.payment_intent) ?? idOf(inv.payments?.data?.[0]?.payment?.payment_intent)
  const row = {
    user_id: userId,
    stripe_invoice_id: inv.id,
    subscription_id: sub?.id ?? null,
    stripe_payment_intent: paymentIntent && paymentIntent.startsWith('pi_') ? paymentIntent : null,
    amount_cents: outcome === 'paid' ? (inv.amount_paid ?? 0) : (inv.amount_due ?? 0),
    currency: inv.currency ?? 'eur',
    status: outcome,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf_url: inv.invoice_pdf ?? null,
    period_start: toIso(line?.period?.start ?? inv.period_start),
    period_end: toIso(line?.period?.end ?? inv.period_end),
  }
  const { error } = await db.from('payments').upsert(row, { onConflict: 'stripe_invoice_id' })
  if (error) throw error

  if (outcome === 'failed') {
    await audit(db, null, 'billing.payment_failed', userId, { invoice: inv.id })
    await db.from('notifications').insert({
      user_id: userId,
      kind: 'billing.payment_failed',
      title: 'Le paiement de votre abonnement a échoué',
      body: 'Mettez à jour votre moyen de paiement pour conserver l’offre Premium.',
      link: '/app/abonnement',
    })
    const { data: user } = await db.auth.admin.getUserById(userId)
    if (user?.user?.email) {
      await sendEmail(user.user.email, 'Échec du paiement de votre abonnement — Economiz', 'Le paiement a échoué',
        'Nous n’avons pas pu prélever votre abonnement Premium. Mettez à jour votre moyen de paiement pour continuer à en profiter.',
        { label: 'Mettre à jour mon paiement', url: `${siteUrl()}/app/abonnement` })
    }
  }
}

async function onRefund(db: Db, charge: Obj) {
  const invoiceId = idOf(charge.invoice)
  const intent = idOf(charge.payment_intent)
  let query = db.from('payments').select('id, user_id, amount_cents')
  if (invoiceId) query = query.eq('stripe_invoice_id', invoiceId)
  else if (intent) query = query.eq('stripe_payment_intent', intent)
  else return
  const { data: payment } = await query.maybeSingle()
  if (!payment) throw new Error('Paiement remboursé introuvable')
  const refunded = Number(charge.amount_refunded ?? 0)
  const status = refunded >= Number(charge.amount ?? payment.amount_cents) ? 'refunded' : 'partially_refunded'
  const { error } = await db.from('payments').update({ refunded_cents: refunded, status }).eq('id', payment.id)
  if (error) throw error
  await audit(db, null, 'billing.refunded', payment.user_id, { amount_cents: refunded })
  await db.from('notifications').insert({ user_id: payment.user_id, kind: 'billing.refunded', title: 'Remboursement effectué', body: 'Un remboursement a été émis sur votre moyen de paiement.', link: '/app/abonnement' })
}

/**
 * Rappel avant le renouvellement d'un abonnement annuel (reconduction tacite,
 * article L215-1 du Code de la consommation : information entre 3 mois et
 * 1 mois avant l'échéance). Stripe envoie invoice.upcoming le nombre de jours
 * réglé dans le tableau de bord (Facturation → Abonnements : 30 jours ou plus).
 */
async function onUpcomingRenewal(db: Db, inv: Obj) {
  const subscriptionId = subscriptionIdOfInvoice(inv)
  if (!subscriptionId) return
  const { data: sub } = await db.from('subscriptions').select('user_id, billing_interval, cancel_at_period_end, current_period_end').eq('stripe_subscription_id', subscriptionId).maybeSingle()
  if (!sub || sub.billing_interval !== 'year' || sub.cancel_at_period_end) return
  const when = toIso(inv.next_payment_attempt ?? inv.period_end) ?? sub.current_period_end
  const date = when ? new Date(when).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'la prochaine échéance'
  const amount = typeof inv.amount_due === 'number' ? `${(inv.amount_due / 100).toFixed(2).replace('.', ',')} €` : null
  const body = `Votre abonnement Premium annuel sera renouvelé le ${date}${amount ? ` pour ${amount}` : ''}. Vous pouvez le résilier à tout moment avant cette date depuis « Mon abonnement », sans frais.`
  await db.from('notifications').insert({ user_id: sub.user_id, kind: 'billing.renewal_reminder', title: 'Renouvellement de votre abonnement annuel', body, link: '/app/abonnement' })
  await audit(db, null, 'billing.renewal_reminder', sub.user_id, { renewal_at: when })
  const { data: user } = await db.auth.admin.getUserById(sub.user_id)
  if (user?.user?.email) {
    await sendEmail(user.user.email, 'Renouvellement de votre abonnement annuel — Economiz', 'Votre abonnement va être renouvelé', body, { label: 'Gérer mon abonnement', url: `${siteUrl()}/app/abonnement` })
  }
}
