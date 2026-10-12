// Variables d'environnement exposées au navigateur.
// Seules des clés publiques peuvent figurer ici : tout secret doit rester
// côté serveur (Edge Functions, scripts).

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variable d’environnement manquante : ${name}`)
  return value
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: required('VITE_SUPABASE_PUBLISHABLE_KEY', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
} as const

if (/^(sb_secret_|sbp_)/.test(env.supabasePublishableKey) || env.supabasePublishableKey.includes('service_role')) {
  throw new Error('Une clé secrète a été fournie au frontend. Utilisez la clé publique (publishable).')
}
