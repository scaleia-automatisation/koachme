// Génération du bilan mensuel en PDF (serveur), selon les limites de l'offre.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'npm:pdf-lib@1.17.1'
import { corsHeaders, error } from '../_shared/http.ts'
import { audit, logEvent } from '../_shared/log.ts'
import { planOf } from '../_shared/plans.ts'
import { adminClient, authenticate } from '../_shared/supabase.ts'

// deno-lint-ignore no-explicit-any
type Snapshot = Record<string, any>

const STATUS = { favorable: 'Situation maîtrisée', vigilance: 'Point de vigilance', prioritaire: 'Priorité d’action' } as Record<string, string>
const SOURCE = { statements: 'constaté sur vos relevés', declared: 'déclaré', mixed: 'relevés et déclarations', none: 'non renseigné' } as Record<string, string>

const euros = (c: number | null | undefined) =>
  c === null || c === undefined ? 'non renseigné' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(c / 100)

/** Caractères compatibles avec les polices PDF standard (WinAnsi). */
const clean = (s: string) =>
  s.replace(/[  ]/g, ' ').replace(/→/g, '->').replace(/[✓✔]/g, '').replace(/[«»]/g, '"').replace(/[^\x20-\x7e -ÿ’‘“”…€–—•]/g, '')

function monthTitle(period: string) {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${period}-01T00:00:00Z`))
  return /^[aeiouy]/i.test(label) ? `Bilan d’${label}` : `Bilan de ${label}`
}

async function render(snapshot: Snapshot, period: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(clean(monthTitle(period)))
  doc.setProducer('Economiz')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595, 842])
  let y = 790
  const ink = rgb(0.12, 0.14, 0.2)
  const muted = rgb(0.42, 0.45, 0.53)
  const brand = rgb(0.17, 0.28, 0.78)

  const ensure = (h: number) => {
    if (y - h < 60) {
      page = doc.addPage([595, 842])
      y = 790
    }
  }
  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = ink) => page.drawText(clean(t), { x, y, size, font: f, color })
  const right = (t: string, xr: number, size = 10, f: PDFFont = font) => page.drawText(clean(t), { x: xr - f.widthOfTextAtSize(clean(t), size), y, size, font: f, color: ink })
  const wrap = (t: string, x: number, width: number, size = 10, f: PDFFont = font, color = ink) => {
    const words = clean(t).split(' ')
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(next, size) > width) {
        ensure(size + 4)
        page.drawText(line, { x, y, size, font: f, color })
        y -= size + 4
        line = w
      } else line = next
    }
    if (line) {
      ensure(size + 4)
      page.drawText(line, { x, y, size, font: f, color })
      y -= size + 4
    }
  }
  const heading = (t: string) => {
    ensure(40)
    y -= 14
    text(t, 50, 12, bold)
    y -= 18
  }

  text('Economiz', 50, 16, bold, brand)
  y -= 34
  text(monthTitle(period), 50, 20, bold)
  y -= 18
  text(`Établi le ${new Date(snapshot.generatedAt).toLocaleDateString('fr-FR')} · statut : ${STATUS[snapshot.status] ?? snapshot.status} · complétude ${snapshot.completenessScore}/100`, 50, 9, font, muted)
  y -= 22
  wrap(`${STATUS[snapshot.status] ?? ''} — ${snapshot.headline}`, 50, 495, 11, bold)
  for (const k of snapshot.keyPoints ?? []) wrap(`• ${k}`, 58, 487)

  heading('Chiffres du mois')
  const rows: [string, string, string][] = [
    ['Revenus mensuels', euros(snapshot.income), SOURCE[snapshot.sources?.income] ?? ''],
    ['Dépenses mensuelles', euros(snapshot.expenses), SOURCE[snapshot.sources?.expenses] ?? ''],
    ['Épargne programmée', euros(snapshot.savings), ''],
    ['Reste budgétaire estimé', euros(snapshot.balance), 'estimation, pas un solde'],
    ['Remboursements de crédits', euros(snapshot.debtRepayments), ''],
    ['Dettes restantes déclarées', euros(snapshot.debtRemaining), ''],
    ['Frais bancaires identifiés', euros(snapshot.fees), ''],
    ['Économies potentielles', euros(snapshot.potentialMonthly), 'estimation, non réalisée'],
    ['Économies confirmées', euros(snapshot.confirmedSavingsMonthly), 'déclarées par vous'],
  ]
  for (const [label, value, note] of rows) {
    ensure(16)
    text(label, 50)
    right(value, 380)
    text(note, 395, 8, font, muted)
    y -= 16
  }

  if (snapshot.byGroup?.length) {
    heading('Dépenses par catégorie')
    for (const g of snapshot.byGroup) {
      ensure(15)
      text(g.label, 50)
      right(euros(g.amount), 380)
      y -= 15
    }
  }
  if (snapshot.priorities?.length) {
    heading('Priorités')
    snapshot.priorities.forEach((p: string, i: number) => wrap(`${i + 1}. ${p}`, 50, 495))
  }
  if (snapshot.goals?.length) {
    heading('Objectifs d’épargne')
    for (const g of snapshot.goals) {
      ensure(15)
      text(g.name, 50)
      right(`${euros(g.current)} / ${euros(g.target)}`, 380)
      y -= 15
    }
  }
  y -= 20
  ensure(30)
  wrap('Document établi par Economiz à partir des données que vous avez importées ou déclarées. Il ne constitue pas un conseil en investissement.', 50, 495, 8, font, muted)
  return doc.save()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return error('method_not_allowed', 'Méthode non autorisée', 405)
  const auth = await authenticate(req)
  if (!auth) return error('unauthorized', 'Session invalide', 401)

  let period: unknown
  try {
    ;({ period } = await req.json())
  } catch {
    return error('bad_request', 'Requête invalide', 400)
  }
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return error('bad_request', 'Période invalide', 400)

  const db = adminClient()
  const userId = auth.user.id
  const { limits } = await planOf(db, userId)
  const max = limits.pdf_exports_per_month
  if (max === 0) return error('plan_limit_exports', 'L’export PDF est inclus dans l’offre Premium', 402)

  const { data: report } = await db.from('monthly_reports').select('snapshot').eq('user_id', userId).eq('period', period).maybeSingle()
  if (!report) return error('not_found', 'Aucun bilan pour ce mois', 404)

  // Consommation atomique d'un export du mois calendaire, refusée au-delà de la limite.
  const { data: allowed, error: usageError } = await db.rpc('usage_try', { p_user: userId, p_metric: 'pdf_export', p_max: max })
  if (usageError) return error('server_error', 'Export momentanément indisponible', 500)
  if (allowed === false) return error('plan_limit_exports', `Votre offre permet ${max} exports PDF par mois`, 402)

  try {
    const pdf = await render(report.snapshot as Snapshot, period)
    await audit(db, userId, 'data.report_exported', userId, { period })
    return new Response(pdf, {
      headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="economiz-bilan-${period}.pdf"`, 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    await logEvent(db, 'error', 'report-pdf', 'render_error', e instanceof Error ? e.message : undefined)
    return error('render_error', 'Le PDF n’a pas pu être généré', 500)
  }
})
