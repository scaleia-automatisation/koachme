// Configuration des secrets serveur à partir de .env.local (jamais versionné) :
// 1. secrets des Edge Functions (Supabase → Edge Functions → Secrets) ;
// 2. coffre-fort de la base (vault) utilisé par les tâches planifiées :
//    adresse du projet et secret de maintenance.
// Seules les variables renseignées sont envoyées : un secret absent de
// .env.local n'est jamais effacé côté Supabase.
//
// Usage : npm run secrets:sync            → envoie et affiche l'état
//         npm run secrets:sync -- --check → affiche l'état sans rien modifier
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const ref = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !token) throw new Error('SUPABASE_PROJECT_REF et SUPABASE_ACCESS_TOKEN sont requis dans .env.local')
const api = (path, init = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } })

/** Secrets des Edge Functions : [nom, obligatoire pour l'ouverture au public, rôle]. */
export const FUNCTION_SECRETS = [
  ['OPENAI_API_KEY', true, 'Lecture des relevés et coach IA'],
  ['OPENAI_MODEL', false, 'Modèle principal (défaut : gpt-4.1-mini)'],
  ['OPENAI_MODEL_STRONG', false, 'Seconde lecture d’un relevé incohérent (défaut : gpt-4.1)'],
  ['OPENAI_MODEL_COACH', false, 'Modèle du coach (défaut : OPENAI_MODEL)'],
  ['COACH_GLOBAL_DAILY_TOKENS', false, 'Plafond quotidien de jetons du coach, tous utilisateurs (défaut 3 000 000)'],
  ['SITE_URL', true, 'Adresse publique du site (liens des emails et retours de paiement)'],
  ['MAINTENANCE_SECRET', true, 'Authentifie les tâches planifiées'],
  ['STRIPE_SECRET_KEY', true, 'Paiement (clé sk_test_… puis sk_live_…)'],
  ['STRIPE_WEBHOOK_SECRET', true, 'Vérification des événements Stripe (whsec_…)'],
  ['RESEND_API_KEY', true, 'Emails transactionnels'],
  ['RESEND_FROM_EMAIL', true, 'Expéditeur (domaine vérifié chez Resend)'],
  ['ALERT_EMAIL', true, 'Destinataire des alertes de surveillance'],
  ['ALERT_ERROR_THRESHOLD', false, 'Seuil d’alerte (erreurs par 15 minutes, défaut 10)'],
]

const check = process.argv.includes('--check')
const existing = new Set(((await (await api('/secrets')).json()) ?? []).map((s) => s.name))
const toSend = FUNCTION_SECRETS.map(([name]) => name).filter((name) => process.env[name])

if (!check && toSend.length) {
  const res = await api('/secrets', { method: 'POST', body: JSON.stringify(toSend.map((name) => ({ name, value: process.env[name] }))) })
  if (!res.ok) throw new Error(`Secrets refusés : ${await res.text()}`)
  toSend.forEach((n) => existing.add(n))
}

// Coffre-fort de la base : adresse du projet et secret de maintenance (tâches pg_cron).
const sql = async (query) => {
  const res = await api('/database/query', { method: 'POST', body: JSON.stringify({ query }) })
  if (!res.ok) throw new Error(`SQL refusé : ${await res.text()}`)
  return res.json()
}
const vault = {
  project_url: process.env.VITE_SUPABASE_URL,
  maintenance_secret: process.env.MAINTENANCE_SECRET,
}
if (!check) {
  for (const [name, value] of Object.entries(vault)) {
    if (!value) continue
    const quoted = `'${value.replace(/'/g, "''")}'`
    await sql(`do $$ declare v_id uuid; begin
      select id into v_id from vault.secrets where name = '${name}';
      if v_id is null then perform vault.create_secret(${quoted}, '${name}');
      else perform vault.update_secret(v_id, ${quoted}); end if;
    end $$;`)
  }
}
const inVault = new Set((await sql("select name from vault.secrets where name in ('project_url', 'maintenance_secret')")).map((r) => r.name))

console.log(check ? 'État des secrets (aucune modification) :' : 'Secrets synchronisés :')
for (const [name, required, role] of FUNCTION_SECRETS) {
  const mark = existing.has(name) ? '✓' : required ? '✗ MANQUANT' : '– (facultatif)'
  console.log(`  ${mark.padEnd(15)} ${name.padEnd(22)} ${role}`)
}
for (const name of Object.keys(vault)) console.log(`  ${(inVault.has(name) ? '✓' : '✗ MANQUANT').padEnd(15)} vault.${name.padEnd(16)} tâches planifiées`)
