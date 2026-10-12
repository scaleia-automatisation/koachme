// Suppression définitive du compte de l'utilisateur connecté.
// Supprime ses relevés du stockage puis son compte : toutes ses données
// (profil, budget, imports, opérations, corrections) sont supprimées en
// cascade par la base. Si l'authentification renforcée est activée, une
// session validée par le second facteur (aal2) est exigée.
import { corsHeaders, error, json } from '../_shared/http.ts'
import { audit } from '../_shared/log.ts'
import { adminClient, authenticate } from '../_shared/supabase.ts'

const CONFIRMATION = 'SUPPRIMER'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return error('method_not_allowed', 'Méthode non autorisée', 405)

  const auth = await authenticate(req)
  if (!auth) return error('unauthorized', 'Session invalide', 401)

  let confirmation: unknown
  try {
    ;({ confirmation } = await req.json())
  } catch {
    return error('bad_request', 'Requête invalide', 400)
  }
  if (confirmation !== CONFIRMATION) return error('confirmation_required', `Saisissez ${CONFIRMATION} pour confirmer`, 400)

  const db = adminClient()
  const userId = auth.user.id
  const { data: allowed } = await db.rpc('rate_limit_hit', { p_key: `delete:${userId}`, p_max: 5, p_window_seconds: 3600 })
  if (allowed === false) return error('rate_limited', 'Trop de tentatives, réessayez plus tard', 429)

  const hasVerifiedFactor = (auth.user.factors ?? []).some((f) => f.status === 'verified')
  if (hasVerifiedFactor && auth.aal !== 'aal2') {
    return error('mfa_required', 'Validez votre code d’authentification avant de supprimer le compte', 403)
  }

  // Suppression des fichiers (pagination par lots de 100).
  for (;;) {
    const { data: files, error: listError } = await db.storage.from('statements').list(userId, { limit: 100 })
    if (listError) return error('storage_error', 'Impossible de supprimer vos fichiers, réessayez', 500)
    if (!files?.length) break
    const { error: rmError } = await db.storage.from('statements').remove(files.map((f) => `${userId}/${f.name}`))
    if (rmError) return error('storage_error', 'Impossible de supprimer vos fichiers, réessayez', 500)
    if (files.length < 100) break
  }

  await audit(db, userId, 'account.deleted', userId, { mfa: hasVerifiedFactor })
  const { error: delError } = await db.auth.admin.deleteUser(userId)
  if (delError) return error('delete_failed', 'La suppression a échoué, réessayez', 500)

  return json({ deleted: true })
})
