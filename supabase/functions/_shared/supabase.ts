import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface AuthContext {
  user: User
  /** Niveau d'authentification de la session : aal2 après validation d'un second facteur. */
  aal: 'aal1' | 'aal2'
}

/** Vérifie le jeton de l'utilisateur et renvoie son identité, ou null. */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) return null
  let aal: 'aal1' | 'aal2' = 'aal1'
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.aal === 'aal2') aal = 'aal2'
  } catch {
    // jeton déjà validé par getUser ; aal1 par défaut
  }
  return { user: data.user, aal }
}
