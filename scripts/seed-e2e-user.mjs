// Crée (ou réinitialise) le compte de test utilisé pour les vérifications
// manuelles et de bout en bout. Les identifiants sont stockés dans .env.local
// (E2E_EMAIL / E2E_PASSWORD), jamais dans le code.
//
// Usage : npm run seed:e2e            → crée ou réinitialise le compte
//         npm run seed:e2e -- --delete → supprime le compte et ses données
import { randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

let email = process.env.E2E_EMAIL
let password = process.env.E2E_PASSWORD
if (!email || !password) {
  email = 'e2e-economiz@example.com'
  password = `E2e-${randomBytes(9).toString('base64url')}7`
  const env = readFileSync('.env.local', 'utf8')
  appendFileSync('.env.local', `${env.endsWith('\n') ? '' : '\n'}\n# --- Compte de test (vérifications manuelles / e2e) ---\nE2E_EMAIL=${email}\nE2E_PASSWORD=${password}\n`)
}

async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((u) => u.email === email)
    if (user || data.users.length < 200) return user ?? null
  }
}

const existing = await findUser()
if (existing) {
  const { data: files } = await admin.storage.from('statements').list(existing.id)
  if (files?.length) await admin.storage.from('statements').remove(files.map((f) => `${existing.id}/${f.name}`))
  await admin.auth.admin.deleteUser(existing.id)
}
if (process.argv.includes('--delete')) {
  console.log('Compte de test supprimé.')
  process.exit(0)
}
const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { terms_version: '2026-10-12', display_name: 'Camille' } })
if (error) throw error
console.log(`Compte de test prêt : ${email} (mot de passe dans .env.local)`)
