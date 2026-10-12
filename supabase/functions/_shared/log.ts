// Journal technique minimisé : jamais de donnée bancaire, de montant, de
// libellé d'opération ni de donnée personnelle. Les messages sont nettoyés
// avant enregistrement (numéros, IBAN, emails masqués).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function scrub(text: string): string {
  return text
    .replace(/[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}/gi, '[iban]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b\d[\d ,.]{5,}\d\b/g, '[nombre]')
    .slice(0, 500)
}

export async function logEvent(db: SupabaseClient, level: 'info' | 'warn' | 'error', source: string, code: string, message?: string, context: Record<string, string | number | boolean | null> = {}) {
  try {
    await db.from('app_logs').insert({ level, source: source.slice(0, 60), code: code.slice(0, 80), message: message ? scrub(message) : null, context })
  } catch {
    // La journalisation ne doit jamais faire échouer le traitement principal.
  }
}

export async function audit(db: SupabaseClient, actor: string | null, action: string, target: string | null, metadata: Record<string, unknown> = {}) {
  try {
    await db.rpc('audit_event', { p_actor: actor, p_action: action, p_target: target, p_metadata: metadata })
  } catch {
    // idem
  }
}
