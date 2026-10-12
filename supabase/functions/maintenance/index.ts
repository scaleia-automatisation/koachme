// Maintenance quotidienne, déclenchée par pg_cron (secret partagé, jamais
// exposé au client) :
// - tâches internes à la base (app_private.run_maintenance) : reprise des
//   imports bloqués, conservation du coach, purge des journaux, rappels
//   mensuels, prévenance d'inactivité ;
// - emails associés (si l'envoi est configuré et si l'utilisateur l'a accepté) ;
// - suppression des comptes inactifs depuis plus de 3 ans + 30 jours, fichiers compris.
//
// Mode « surveillance » (toutes les 15 minutes) : si les erreurs s'accumulent,
// l'équipe est prévenue par email (ALERT_EMAIL), au plus une fois par heure et
// par type d'alerte. Seuils : ALERT_ERROR_THRESHOLD (10 erreurs par défaut),
// toute erreur du webhook de paiement, 5 imports en échec.
import { json } from '../_shared/http.ts'
import { sendEmail, siteUrl } from '../_shared/email.ts'
import { audit, logEvent } from '../_shared/log.ts'
import { adminClient } from '../_shared/supabase.ts'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('MAINTENANCE_SECRET')
  const provided = req.headers.get('x-maintenance-secret') ?? ''
  if (req.method !== 'POST' || !secret || !timingSafeEqual(provided, secret)) return json({ error: 'forbidden' }, 403)

  const db = adminClient()
  let mode: unknown = null
  try {
    ;({ mode } = await req.json())
  } catch {
    // corps vide : maintenance quotidienne
  }
  if (mode === 'surveillance') return json(await surveillance(db))

  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const { data: report, error } = await db.rpc('run_maintenance')
  if (error) {
    await logEvent(db, 'error', 'maintenance', 'run_failed', error.message)
    return json({ error: 'run_failed' }, 500)
  }

  // Emails des rappels et prévenances créés lors de ce passage.
  let emails = 0
  const { data: targets } = await db.rpc('maintenance_email_targets', { p_since: startedAt })
  for (const t of (targets ?? []) as { user_id: string; email: string; kind: string; notify_email: boolean }[]) {
    if (t.kind === 'monthly.reminder' && !t.notify_email) continue
    const result =
      t.kind === 'monthly.reminder'
        ? await sendEmail(t.email, 'Votre bilan du mois vous attend — Economiz', 'Mettez à jour votre bilan', 'Importez le relevé du mois écoulé pour suivre votre progression et mettre à jour vos priorités.', { label: 'Mettre à jour mon bilan', url: `${siteUrl()}/app/releves` })
        : await sendEmail(t.email, 'Votre compte Economiz va être supprimé', 'Compte inactif depuis 3 ans', 'Sans connexion de votre part dans les 30 jours, votre compte et toutes vos données seront définitivement supprimés.', { label: 'Me connecter', url: `${siteUrl()}/connexion` })
    if (result === 'sent') emails++
  }

  // Suppression des comptes inactifs (fichiers, puis compte : données supprimées en cascade).
  let deleted = 0
  for (const userId of (report?.accounts_to_delete ?? []) as string[]) {
    try {
      for (;;) {
        const { data: files } = await db.storage.from('statements').list(userId, { limit: 100 })
        if (!files?.length) break
        await db.storage.from('statements').remove(files.map((f) => `${userId}/${f.name}`))
        if (files.length < 100) break
      }
      await audit(db, null, 'account.deleted_inactivity', userId, {})
      const { error: delError } = await db.auth.admin.deleteUser(userId)
      if (!delError) deleted++
    } catch (e) {
      await logEvent(db, 'error', 'maintenance', 'inactive_delete_failed', e instanceof Error ? e.message : undefined)
    }
  }

  const summary = { ...report, accounts_to_delete: undefined, emails_sent: emails, inactive_accounts_deleted: deleted }
  await logEvent(db, 'info', 'maintenance', 'daily_run', undefined, Object.fromEntries(Object.entries(summary).filter(([, v]) => typeof v === 'number')) as Record<string, number>)
  return json(summary)
})

async function surveillance(db: ReturnType<typeof adminClient>) {
  const { data: snap, error } = await db.rpc('monitoring_snapshot', { p_minutes: 15 })
  if (error || !snap) return { error: 'snapshot_failed' }
  const threshold = Number(Deno.env.get('ALERT_ERROR_THRESHOLD') ?? 10)
  const alerts: string[] = []
  if (snap.errors >= threshold) alerts.push(`${snap.errors} erreurs techniques en 15 minutes (seuil ${threshold}).`)
  if (snap.webhook_errors > 0) alerts.push(`${snap.webhook_errors} erreur(s) du webhook de paiement : des abonnements peuvent ne pas être à jour.`)
  if (snap.failed_imports >= 5) alerts.push(`${snap.failed_imports} relevés en échec en 15 minutes.`)
  if (!alerts.length) return { ...snap, alerted: false }

  const to = Deno.env.get('ALERT_EMAIL')
  // Une alerte par heure au maximum, même si le problème persiste.
  const { data: allowed } = await db.rpc('rate_limit_hit', { p_key: 'alert:surveillance', p_max: 1, p_window_seconds: 3600 })
  if (!allowed) return { ...snap, alerted: false, throttled: true }
  await logEvent(db, 'warn', 'surveillance', 'alert', alerts.join(' '), { errors: snap.errors, webhook_errors: snap.webhook_errors, failed_imports: snap.failed_imports })
  const codes = (snap.top_codes as { code: string; n: number }[]).map((c) => `${c.code} (${c.n})`).join(', ')
  const sent = to
    ? await sendEmail(to, 'Alerte Economiz : erreurs en hausse', 'Alerte de surveillance', `${alerts.join('<br>')}<br><br>Principales erreurs : ${codes || '—'}`, { label: 'Ouvrir l’administration', url: `${siteUrl()}/admin/technique` })
    : 'skipped'
  return { ...snap, alerted: true, email: sent }
}
