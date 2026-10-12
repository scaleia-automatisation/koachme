// Emails transactionnels via Resend. Sans clé configurée, l'envoi est ignoré
// (et signalé dans le journal technique) : aucune fonctionnalité ne dépend
// de la réussite d'un email.
const FROM = Deno.env.get('RESEND_FROM_EMAIL') || 'Economiz <onboarding@resend.dev>'

export function emailEnabled(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY'))
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2433">
<table role="presentation" width="100%" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border:1px solid #e6e8ee;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:600;color:#2c48c7;padding-bottom:20px">Economiz</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#4a5068;padding-bottom:20px">${body}</td></tr>
${cta ? `<tr><td><a href="${cta.url}" style="display:inline-block;background:#2c48c7;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${cta.label}</a></td></tr>` : ''}
</table><p style="font-size:12px;color:#9aa0b4;margin-top:16px">Economiz ne vous demandera jamais vos identifiants bancaires.</p>
</td></tr></table></body></html>`
}

export async function sendEmail(to: string, subject: string, title: string, body: string, cta?: { label: string; url: string }): Promise<'sent' | 'skipped' | 'failed'> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return 'skipped'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html: layout(title, body, cta) }),
    })
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

export function siteUrl(): string {
  return (Deno.env.get('SITE_URL') ?? 'http://localhost:5180').replace(/\/$/, '')
}
