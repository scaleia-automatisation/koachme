// Configuration Stripe (mode test d'abord) en une commande, idempotente :
// 1. produit « Economiz Premium » et ses prix mensuel / annuel, aux montants de
//    la table plans (source de vérité, modifiable dans l'administration) ;
// 2. identifiants de prix enregistrés dans la table plans ;
// 3. point de terminaison du webhook (événements nécessaires) ;
// 4. portail client : moyen de paiement, factures, changement de formule,
//    résiliation en fin de période.
//
// Prérequis : STRIPE_SECRET_KEY (sk_test_…) dans .env.local.
// Usage : npm run stripe:setup
// Ensuite : copier le secret du webhook affiché dans STRIPE_WEBHOOK_SECRET
// (.env.local), puis npm run secrets:sync.
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY manquante dans .env.local (clé de test sk_test_… depuis dashboard.stripe.com/test/apikeys).')
  process.exit(1)
}
const live = key.startsWith('sk_live_')
console.log(live ? '⚠ Clé de PRODUCTION (sk_live_) : configuration du mode réel.' : 'Mode test Stripe.')

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}[${k}]` : k
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))))
    else if (typeof v === 'object') form(v, name, out)
    else out.append(name, String(v))
  }
  return out
}

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2025-01-27.acacia' },
    body: body ? form(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe ${method} ${path} : ${json.error?.message ?? res.status}`)
  return json
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL refusé : ${await res.text()}`)
  return res.json()
}

// 1. Produit et prix (retrouvés par leur clé de recherche : relancer le script ne crée pas de doublon)
const [plan] = await sql("select id, name, monthly_price_cents, yearly_price_cents from public.plans where id = 'premium'")
if (!plan) throw new Error('Offre premium introuvable dans la table plans')
let product = (await stripe('GET', `/products/search?query=${encodeURIComponent("metadata['plan_id']:'premium'")}`)).data[0]
if (!product) product = await stripe('POST', '/products', { name: `Economiz ${plan.name}`, metadata: { plan_id: 'premium' }, tax_code: 'txcd_10103001' })
console.log(`✓ Produit ${product.id}`)

async function price(interval, amount) {
  const lookup = `economiz_premium_${interval}_${amount}`
  const found = (await stripe('GET', `/prices?lookup_keys[]=${lookup}&active=true`)).data[0]
  if (found) return found
  return stripe('POST', '/prices', { product: product.id, currency: 'eur', unit_amount: amount, recurring: { interval }, lookup_key: lookup, tax_behavior: 'inclusive', metadata: { plan_id: 'premium' } })
}
const monthly = await price('month', plan.monthly_price_cents)
const yearly = plan.yearly_price_cents ? await price('year', plan.yearly_price_cents) : null
console.log(`✓ Prix mensuel ${monthly.id} (${plan.monthly_price_cents / 100} € TTC)${yearly ? `, annuel ${yearly.id} (${plan.yearly_price_cents / 100} € TTC)` : ''}`)

// 2. Identifiants de prix dans la table plans
await sql(`update public.plans set stripe_price_monthly = '${monthly.id}', stripe_price_yearly = ${yearly ? `'${yearly.id}'` : 'null'} where id = 'premium'`)
console.log('✓ Table plans mise à jour')

// 3. Webhook
const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`
const events = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.upcoming',
  'charge.refunded',
]
const endpoints = (await stripe('GET', '/webhook_endpoints?limit=100')).data
const existing = endpoints.find((e) => e.url === url)
if (existing) {
  await stripe('POST', `/webhook_endpoints/${existing.id}`, { enabled_events: events })
  console.log(`✓ Webhook ${existing.id} mis à jour (son secret reste celui déjà configuré)`)
} else {
  const created = await stripe('POST', '/webhook_endpoints', { url, enabled_events: events, description: 'Economiz — droits des abonnés' })
  console.log(`✓ Webhook ${created.id} créé`)
  console.log(`\n  ➜ Secret du webhook : ${created.secret}\n    Copiez-le dans STRIPE_WEBHOOK_SECRET (.env.local), puis : npm run secrets:sync\n`)
}

// 4. Portail client
const site = process.env.SITE_URL ?? 'http://localhost:5180'
const portal = {
  business_profile: { headline: 'Economiz — gérer mon abonnement', privacy_policy_url: `${site}/confidentialite`, terms_of_service_url: `${site}/cgu` },
  features: {
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'unused', 'other'] } },
    subscription_update: yearly
      ? { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products: [{ product: product.id, prices: [monthly.id, yearly.id] }] }
      : { enabled: false },
  },
}
const configs = (await stripe('GET', '/billing_portal/configurations?is_default=true')).data
if (configs[0]) await stripe('POST', `/billing_portal/configurations/${configs[0].id}`, portal)
else await stripe('POST', '/billing_portal/configurations', portal)
console.log('✓ Portail client configuré (résiliation en fin de période, changement de formule)')

console.log(`
Reste à régler dans le tableau de bord Stripe :
  • Facturation → Abonnements et emails : « Envoyer des rappels de renouvellement » 30 jours avant (rappel annuel, loi Chatel)
  • Paramètres → Identité de l'entreprise et Factures : raison sociale, adresse, SIREN, numéro de TVA (mentions obligatoires)
  • Stripe Tax (si assujetti à la TVA) : immatriculation France et guichet unique OSS pour l'UE
  • Mode réel : refaire « npm run stripe:setup » avec la clé sk_live_ et mettre à jour les secrets`)
