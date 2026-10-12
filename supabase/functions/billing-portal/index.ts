// Espace client Stripe : changer de formule, moyen de paiement, factures,
// résiliation. Les changements reviennent par le webhook vérifié.
// { flow: 'cancel' } ouvre directement l'écran de résiliation (obligation de
// résiliation en ligne simple, article L215-1-1 du Code de la consommation).
import { corsHeaders, error, json } from '../_shared/http.ts'
import { siteUrl } from '../_shared/email.ts'
import { logEvent } from '../_shared/log.ts'
import { stripeClient, stripeConfigured } from '../_shared/stripe.ts'
import { adminClient, authenticate } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return error('method_not_allowed', 'Méthode non autorisée', 405)
  const auth = await authenticate(req)
  if (!auth) return error('unauthorized', 'Session invalide', 401)
  if (!stripeConfigured()) return error('billing_not_configured', 'La gestion de l’abonnement n’est pas encore disponible', 503)

  const db = adminClient()
  const { data: allowed } = await db.rpc('rate_limit_hit', { p_key: `portal:${auth.user.id}`, p_max: 20, p_window_seconds: 3600 })
  if (allowed === false) return error('rate_limited', 'Trop de tentatives, réessayez plus tard', 429)
  const { data: customer } = await db.from('billing_customers').select('stripe_customer_id').eq('user_id', auth.user.id).maybeSingle()
  if (!customer) return error('no_customer', 'Aucun abonnement à gérer', 404)

  let flow: unknown = null
  try {
    ;({ flow } = await req.json())
  } catch {
    // corps vide : portail général
  }
  let cancelSubscription: string | null = null
  if (flow === 'cancel') {
    const { data: sub } = await db
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', auth.user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .eq('cancel_at_period_end', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!sub) return error('nothing_to_cancel', 'Aucun abonnement en cours à résilier', 404)
    cancelSubscription = sub.stripe_subscription_id
  }

  try {
    const session = await stripeClient().billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${siteUrl()}/app/abonnement`,
      locale: 'fr',
      ...(cancelSubscription
        ? { flow_data: { type: 'subscription_cancel' as const, subscription_cancel: { subscription: cancelSubscription }, after_completion: { type: 'redirect' as const, redirect: { return_url: `${siteUrl()}/app/abonnement?resiliation=1` } } } }
        : {}),
    })
    return json({ url: session.url })
  } catch (e) {
    await logEvent(db, 'error', 'billing-portal', 'stripe_error', e instanceof Error ? e.message : undefined)
    return error('stripe_error', 'L’espace de gestion n’a pas pu être ouvert, réessayez', 502)
  }
})
