// Configuration de Supabase Auth, versionnée avec le code.
// Usage : npm run auth:config            → applique la configuration
//         npm run auth:config -- --check → affiche les écarts sans rien modifier
//
// SITE_URL (dans .env.local) définit l'URL publique de l'application ; les liens
// des emails pointent vers /auth/confirmation avec un token_hash, ce qui
// fonctionne même si l'email est ouvert sur un autre appareil.
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const ref = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
const siteUrl = process.env.SITE_URL ?? 'http://localhost:5180'
if (!ref || !token) {
  console.error('SUPABASE_PROJECT_REF et SUPABASE_ACCESS_TOKEN doivent être définis dans .env.local')
  process.exit(1)
}

const link = (type) => `{{ .SiteURL }}/auth/confirmation?token_hash={{ .TokenHash }}&type=${type}`

const layout = (title, body, cta, url) => `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e8ee;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;color:#2c48c7;padding-bottom:24px">Economiz</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#4a5068;padding-bottom:24px">${body}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${url}" style="display:inline-block;background:#2c48c7;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${cta}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#7a8098">Ce lien est valable 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email : aucune modification ne sera faite.</td></tr>
</table>
<p style="font-size:12px;color:#9aa0b4;margin-top:16px">Economiz — Votre argent, en clair. Nous ne vous demanderons jamais vos identifiants bancaires.</p>
</td></tr></table></body></html>`

const settings = {
  site_url: siteUrl,
  uri_allow_list: [`${siteUrl}/**`].join(','),
  disable_signup: false,
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,
  mailer_otp_exp: 3600,
  password_min_length: 8,
  password_required_characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  external_anonymous_users_enabled: false,
  // Refuse les mots de passe ayant fuité (HaveIBeenPwned) : offre Pro de Supabase uniquement.
  ...(process.env.SUPABASE_PLAN_PRO === 'true' ? { password_hibp_enabled: true } : {}),
}

// Les modèles d’email personnalisés exigent un SMTP dédié (Resend) sur l’offre gratuite.
const templates = {
  mailer_subjects_confirmation: 'Confirmez votre adresse email — Economiz',
  mailer_templates_confirmation_content: layout(
    'Bienvenue sur Economiz',
    'Confirmez votre adresse email pour activer votre compte et réaliser votre premier bilan.',
    'Confirmer mon adresse',
    link('signup'),
  ),
  mailer_subjects_recovery: 'Réinitialisation de votre mot de passe — Economiz',
  mailer_templates_recovery_content: layout(
    'Réinitialiser votre mot de passe',
    'Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.',
    'Choisir un nouveau mot de passe',
    link('recovery'),
  ),
  mailer_subjects_email_change: 'Confirmez votre nouvelle adresse email — Economiz',
  mailer_templates_email_change_content: layout(
    'Changement d’adresse email',
    'Confirmez cette adresse pour l’associer à votre compte Economiz.',
    'Confirmer cette adresse',
    link('email_change'),
  ),
  mailer_subjects_reauthentication: 'Votre code de confirmation — Economiz',
  mailer_templates_reauthentication_content: layout(
    'Code de confirmation',
    'Saisissez ce code dans Economiz pour confirmer l’opération : <strong style="font-size:20px;letter-spacing:2px">{{ .Token }}</strong>',
    'Ouvrir Economiz',
    '{{ .SiteURL }}',
  ),
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const current = await (await fetch(api, { headers })).json()
// SMTP dédié : Resend (RESEND_API_KEY et RESEND_FROM_EMAIL dans .env.local).
const from = process.env.RESEND_FROM_EMAIL?.match(/^(.*?)s*<([^>]+)>$/)
const smtp =
  process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
    ? {
        smtp_host: 'smtp.resend.com',
        smtp_port: '465',
        smtp_user: 'resend',
        smtp_pass: process.env.RESEND_API_KEY,
        smtp_admin_email: from ? from[2] : process.env.RESEND_FROM_EMAIL,
        smtp_sender_name: from ? from[1] : 'Economiz',
        smtp_max_frequency: 60,
        rate_limit_email_sent: 100,
      }
    : {}
const smtpReady = Boolean(current.smtp_host) || Boolean(smtp.smtp_host)
const desired = smtpReady ? { ...settings, ...smtp, ...templates } : settings
if (!smtpReady) console.log('SMTP non configuré (RESEND_API_KEY absente) : modèles d’email français non appliqués (emails Supabase par défaut, 2 envois/heure).')
// Le mot de passe SMTP n'est jamais renvoyé par l'API : il n'est envoyé que si l'hôte change.
const diff = Object.keys(desired).filter((k) => (k === 'smtp_pass' ? current.smtp_host !== desired.smtp_host : JSON.stringify(String(current[k] ?? '')) !== JSON.stringify(String(desired[k] ?? '')) && JSON.stringify(current[k]) !== JSON.stringify(desired[k])))

if (process.argv.includes('--check')) {
  console.log(diff.length ? `Écarts : ${diff.join(', ')}` : 'Configuration Auth conforme.')
  process.exit(diff.length ? 1 : 0)
}
if (!diff.length) {
  console.log('Configuration Auth déjà conforme.')
  process.exit(0)
}
const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(Object.fromEntries(diff.map((k) => [k, desired[k]]))) })
if (!res.ok) {
  console.error(`Échec (${res.status}) : ${await res.text()}`)
  process.exit(1)
}
console.log(`Configuration Auth mise à jour : ${diff.join(', ')}`)
