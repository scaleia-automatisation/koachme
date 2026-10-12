// Attribution d'un rôle d'équipe (amorçage du premier administrateur).
// Exécuté côté serveur avec la clé secrète ; ensuite, les administrateurs
// gèrent les droits depuis l'espace d'administration.
//
// Usage : npm run admin:grant -- email@exemple.fr admin|support [--revoke]
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const [email, role] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const revoke = process.argv.includes('--revoke')
if (!email || !['admin', 'support'].includes(role)) {
  console.error('Usage : npm run admin:grant -- email@exemple.fr admin|support [--revoke]')
  process.exit(1)
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
let user = null
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
  if (data.users.length < 1000) break
}
if (!user) {
  console.error(`Aucun compte pour ${email}`)
  process.exit(1)
}

const { error } = revoke
  ? await db.from('user_roles').delete().eq('user_id', user.id).eq('role', role)
  : await db.from('user_roles').upsert({ user_id: user.id, role }, { onConflict: 'user_id,role' })
if (error) throw error
await db.rpc('audit_event', { p_actor: null, p_action: revoke ? 'admin.role_revoked' : 'admin.role_granted', p_target: user.id, p_metadata: { role, via: 'script' } })
console.log(`${revoke ? 'Rôle retiré' : 'Rôle attribué'} : ${role} → ${email}`)
