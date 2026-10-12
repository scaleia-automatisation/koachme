// Suppression d'un compte par l'équipe (demande d'effacement reçue par email,
// compte abusif) : fichiers des relevés, puis compte et données en cascade,
// avec journalisation. Équivalent de la suppression faite par l'utilisateur.
// Ne pas supprimer un compte depuis le tableau de bord Supabase : ses fichiers
// resteraient dans le stockage.
//
// Usage : npm run user:delete -- email@exemple.fr --confirm
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const email = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!email || !process.argv.includes('--confirm')) {
  console.error('Usage : npm run user:delete -- email@exemple.fr --confirm   (suppression définitive)')
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
const { data: sub } = await db.from('subscriptions').select('status').eq('user_id', user.id).in('status', ['active', 'trialing', 'past_due']).maybeSingle()
if (sub) console.warn('⚠ Abonnement en cours : pensez à le résilier dans le tableau de bord Stripe.')
let files = 0
for (;;) {
  const { data } = await db.storage.from('statements').list(user.id, { limit: 100 })
  if (!data?.length) break
  await db.storage.from('statements').remove(data.map((f) => `${user.id}/${f.name}`))
  files += data.length
  if (data.length < 100) break
}
await db.rpc('audit_event', { p_actor: null, p_action: 'account.deleted', p_target: null, p_metadata: { via: 'script' } })
const { error } = await db.auth.admin.deleteUser(user.id)
if (error) throw error
console.log(`Compte ${email} supprimé (${files} fichier(s) de relevés effacé(s)).`)
