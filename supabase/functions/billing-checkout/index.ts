// Création d'une session Stripe Checkout pour l'abonnement Premium.
// Le prix est lu dans la table plans (modifiable sans toucher au code) ;
// l'activation des droits ne se fait QUE par le webhook vérifié.
import { corsHeaders, error, json } from '../_shared/http.ts'
import { siteUrl } from '../_shared/email.ts'
import { audit, logEvent } from '../_shared/log.ts'
import { planOf } from '../_shared/plans.ts'
import { stripeClient, stripeConfigured } from '../_shared/stripe.ts'
import { adminClient, authenticate } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return error('method_not_allowed', 'Méthode non autorisée', 405)
  const auth = await authenticate(req)
  if (!auth) return error('unauthorized', 'Session invalide', 401)

  let body: { plan?: unknown; interval?: unknown; immediateStart?: unknown }
  try {
    body = await req.json()
  } catch {
    return error('bad_request', 'Requête invalide', 400)
  }
  const planId = body.plan === undefined ? 'premium' : body.plan
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' || body.interval === undefined ? 'month' : null
  if (typeof planId !== 'string' || !/^[a-z_]+$/.test(planId) || !interval) return error('bad_request', 'Offre invalide', 400)
  // Exécution immédiate pendant le délai de rétractation : demande expresse obligatoire (art. L221-25 du Code de la consommation).
  if (body.immediateStart !== true) return error('consent_required', 'Merci de confirmer la demande d’accès immédiat', 400)

  const db = adminClient()
  const userId = auth.user.id
  const { data: allowed } = await db.rpc('rate_limit_hit', { p_key: `checkout:${userId}`, p_max: 10, p_window_seconds: 3600 })
  if (allowed === false) return error('rate_limited', 'Trop de tentatives, réessayez plus tard', 429)

  const { data: plan } = await db.from('plans').select('id, stripe_price_monthly, stripe_price_yearly, monthly_price_cents, is_active').eq('id', planId).maybeSingle()
  if (!plan || !plan.is_active || plan.monthly_price_cents === 0) return error('bad_request', 'Offre indisponible', 400)
  const price = interval === 'year' ? plan.stripe_price_yearly : plan.stripe_price_monthly
  if (!stripeConfigured() || !price) return error('billing_not_configured', 'Le paiement en ligne n’est pas encore disponible', 503)

  const current = await planOf(db, userId)
  if (current.plan === planId) return error('already_subscribed', 'Vous bénéficiez déjà de cette offre', 409)

  const stripe = stripeClient()
  try {
    // Client Stripe réutilisé d'un paiement à l'autre.
    let { data: customer } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle()
    if (!customer) {
      const created = await stripe.customers.create({ email: auth.user.email, metadata: { user_id: userId } }, { idempotencyKey: `customer-${userId}` })
      await db.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: created.id })
      customer = { stripe_customer_id: created.id }
    }

    const consentAt = new Date().toISOString()
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.stripe_customer_id,
      client_reference_id: userId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { user_id: userId, plan_id: planId, immediate_start_consent_at: consentAt } },
      metadata: { user_id: userId, plan_id: planId, immediate_start_consent_at: consentAt },
      allow_promotion_codes: true,
      locale: 'fr',
      success_url: `${siteUrl()}/app/abonnement?paiement=retour`,
      cancel_url: `${siteUrl()}/app/abonnement?paiement=annule`,
    })
    await audit(db, userId, 'billing.checkout_started', userId, { plan: planId, interval, immediate_start_consent_at: consentAt })
    return json({ url: session.url })
  } catch (e) {
    await logEvent(db, 'error', 'billing-checkout', 'stripe_error', e instanceof Error ? e.message : undefined)
    return error('stripe_error', 'Le paiement n’a pas pu être initialisé, réessayez', 502)
  }
})
