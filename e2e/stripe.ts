// Événements Stripe signés comme le ferait Stripe (HMAC-SHA256 avec le secret
// du webhook), envoyés au vrai webhook déployé.
import { createHmac, randomUUID } from 'node:crypto'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const URL_WEBHOOK = `${process.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export async function sendStripeEvent(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: 'event', type, api_version: '2025-01-27.acacia', created: Math.floor(Date.now() / 1000), livemode: false, data: { object } })
  const t = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')
  const res = await fetch(URL_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${signature}` }, body: payload })
  if (res.status !== 200) throw new Error(`Webhook ${type} : ${res.status} ${await res.text()}`)
}

/** Abonnement Stripe minimal tel que reçu par le webhook. */
export function stripeSubscription(userId: string, ids: { customer: string; subscription: string }, status: string, opts: { interval?: 'month' | 'year'; cancelAtPeriodEnd?: boolean; periodEnd?: number } = {}) {
  const periodEnd = opts.periodEnd ?? Math.floor(Date.now() / 1000) + 30 * 86400
  return {
    id: ids.subscription,
    object: 'subscription',
    customer: ids.customer,
    status,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    canceled_at: null,
    current_period_end: periodEnd,
    metadata: { user_id: userId, plan_id: 'premium' },
    items: { data: [{ price: { id: 'price_test_e2e', recurring: { interval: opts.interval ?? 'month' } }, current_period_end: periodEnd }] },
  }
}

export function stripeInvoice(ids: { customer: string; subscription: string }, id: string, extra: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id,
    object: 'invoice',
    customer: ids.customer,
    subscription: ids.subscription,
    currency: 'eur',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    invoice_pdf: 'https://pay.stripe.com/invoice/test/pdf',
    payment_intent: `pi_${id}`,
    lines: { data: [{ period: { start: now, end: now + 30 * 86400 } }] },
    ...extra,
  }
}
