// Remontée des erreurs du navigateur dans le journal technique (app_logs),
// en production uniquement. Le serveur nettoie le message (emails, IBAN,
// nombres) et limite la fréquence ; aucune donnée financière n'est envoyée.
import { supabase } from './supabase'

const sent = new Set<string>()

export function reportError(code: string, error: unknown) {
  if (!import.meta.env.PROD) return
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const key = `${code}|${message}`
  if (sent.has(key) || sent.size > 20) return
  sent.add(key)
  void supabase.rpc('log_client_error', { p_code: code, p_message: message, p_path: window.location.pathname }).then(
    () => undefined,
    () => undefined,
  )
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError('window_error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('unhandled_rejection', e.reason))
}
