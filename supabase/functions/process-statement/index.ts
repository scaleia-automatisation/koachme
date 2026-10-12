// Chaîne de traitement d'un relevé bancaire PDF déposé dans le stockage privé.
//
//  1. Vérification du fichier (propriétaire, format PDF, taille, pages).
//  2. Extraction du texte du PDF.
//  3. OCR des documents scannés — uniquement avec l'accord explicite de
//     l'utilisateur (le document est alors transmis sans masquage possible).
//  4-5. Normalisation : date, libellé, montant signé (sens), devise, compte,
//     opérations en attente, page d'origine. Données d'identification masquées
//     avant l'envoi au LLM (relevés texte).
//  6. Suggestion de catégorie par le LLM (la décision finale est prise par le
//     moteur déterministe de l'application).
//  9. Contrôle de cohérence : solde initial + opérations comptabilisées = solde
//     final. En cas d'écart, seconde extraction avec un modèle plus puissant ;
//     si l'écart persiste, il est enregistré et l'import n'est pas compté dans
//     le bilan tant que l'utilisateur ne l'a pas vérifié.
// 11. Enregistrement des opérations normalisées (source : import, page,
//     méthode d'extraction ; statut de vérification « auto »).
//
// Les étapes 7, 8, 10 et 12 (récurrences, doublons, validation, diagnostic)
// sont réalisées par le moteur de l'application (src/domain), à partir de
// ces données. Un import n'est jamais marqué réussi si son contenu n'a pas
// été correctement traité : il passe alors en échec avec un code explicite.
import { extractText, getDocumentProxy } from 'npm:unpdf@1.3.2'
import { corsHeaders, error, json } from '../_shared/http.ts'
import { findAccountLast4, redact } from '../_shared/redact.ts'
import { logEvent } from '../_shared/log.ts'
import { fetchWithRetry, planOf } from '../_shared/plans.ts'
import { adminClient, authenticate } from '../_shared/supabase.ts'
import { checkStatementBalance } from '../_shared/domain/balance.ts'

const MAX_PAGES = 40
const MIN_CHARS_PER_PAGE = 80
const CHUNK_CHARS = 24_000
const DAILY_IMPORT_LIMIT = 30
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini'
const STRONG_MODEL = Deno.env.get('OPENAI_MODEL_STRONG') ?? 'gpt-4.1'
const SUPPORTED_CURRENCIES = new Set(['EUR'])

type ErrorCode =
  | 'not_pdf'
  | 'encrypted'
  | 'needs_ocr'
  | 'unreadable'
  | 'too_long'
  | 'not_statement'
  | 'no_operations'
  | 'unsupported_currency'
  | 'processing_error'

class ImportError extends Error {
  constructor(public code: ErrorCode) {
    super(code)
  }
}

interface ExtractedOperation {
  date: string
  label: string
  amount: number
  is_pending: boolean
  page: number | null
  category: string | null
  confidence: number
}

interface Extraction {
  is_bank_statement: boolean
  bank_name: string | null
  account_last_digits: string | null
  currency: string | null
  period_start: string | null
  period_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  operations: ExtractedOperation[]
}

interface Category {
  code: string
  label: string
  kind: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return error('method_not_allowed', 'Méthode non autorisée', 405)

  const auth = await authenticate(req)
  if (!auth) return error('unauthorized', 'Session invalide', 401)

  let body: { importId?: unknown; allowOcr?: unknown }
  try {
    body = await req.json()
  } catch {
    return error('bad_request', 'Requête invalide', 400)
  }
  const { importId } = body
  const allowOcr = body.allowOcr === true
  if (typeof importId !== 'string' || !/^[0-9a-f-]{36}$/i.test(importId)) return error('bad_request', 'Import invalide', 400)

  const db = adminClient()
  const { data: imp } = await db
    .from('statement_imports')
    .select('id, user_id, file_path, status, extraction_attempts')
    .eq('id', importId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!imp) return error('not_found', 'Import introuvable', 404)
  if (!['uploaded', 'failed'].includes(imp.status)) return error('conflict', 'Import déjà traité', 409)
  if (imp.extraction_attempts >= 5) return error('too_many_attempts', 'Nombre maximal de tentatives atteint pour ce fichier', 429)

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await db
    .from('statement_imports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .gte('created_at', since)
  if ((count ?? 0) > DAILY_IMPORT_LIMIT) return error('rate_limited', 'Trop d’imports aujourd’hui, réessayez demain', 429)

  // Limite mensuelle de l'offre (déduite côté serveur des abonnements vérifiés).
  if (imp.status === 'uploaded') {
    const { limits } = await planOf(db, auth.user.id)
    const max = limits.statement_imports_per_month
    if (max !== null) {
      const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
      const { count: used } = await db
        .from('statement_imports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', auth.user.id)
        .gte('created_at', monthStart)
        .neq('status', 'failed')
        .neq('id', imp.id)
      if ((used ?? 0) >= max) {
        // Le fichier déposé n'est pas conservé : il ne sera pas analysé.
        await db.storage.from('statements').remove([imp.file_path])
        await db.from('statement_imports').delete().eq('id', imp.id)
        return error('plan_limit_imports', `Votre offre permet ${max} relevé${max > 1 ? 's' : ''} analysé${max > 1 ? 's' : ''} par mois`, 402)
      }
    }
  }

  await db
    .from('statement_imports')
    .update({ status: 'processing', error_code: null, extraction_attempts: imp.extraction_attempts + 1 })
    .eq('id', imp.id)

  // @ts-ignore EdgeRuntime est fourni par l'environnement Supabase
  EdgeRuntime.waitUntil(processImport(imp.id, imp.user_id, imp.file_path, allowOcr))
  return json({ status: 'processing' }, 202)
})

async function processImport(importId: string, userId: string, filePath: string, allowOcr: boolean) {
  const db = adminClient()
  try {
    // 1. Vérification du fichier
    const { data: file, error: dlError } = await db.storage.from('statements').download(filePath)
    if (dlError || !file) throw new ImportError('processing_error')
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new ImportError('not_pdf')

    const categories = await loadCategories()
    const validCodes = new Set(categories.map((c) => c.code))

    // 2-3. Texte ou OCR
    const pages = await readPdf(bytes)
    let method: 'text' | 'ocr'
    let accountLast4: string | null
    let run: (model: string) => Promise<Extraction[]>

    if (pages) {
      method = 'text'
      accountLast4 = findAccountLast4(pages.join('\n'))
      const { data: profile } = await db.from('profiles').select('display_name').eq('id', userId).maybeSingle()
      const chunks = chunkPages(pages.map((p) => redact(p, profile?.display_name ?? null)))
      run = (model) => Promise.all(chunks.map((text, i) => extract(model, categories, { kind: 'text', text, first: i === 0 })))
    } else {
      if (!allowOcr) throw new ImportError('needs_ocr')
      method = 'ocr'
      accountLast4 = null
      run = (model) => extract(model, categories, { kind: 'pdf', bytes }).then((r) => [r])
    }

    // 4-6, 9. Extraction, normalisation et contrôle des soldes (avec seconde tentative si écart)
    let result = normalize(await run(MODEL), validCodes)
    if (result.balanceCheck === 'mismatch') {
      const second = normalize(await run(STRONG_MODEL), validCodes)
      if (second.gap !== null && (result.gap === null || Math.abs(second.gap) < Math.abs(result.gap))) result = second
    }
    if (method === 'ocr') accountLast4 = result.header.account_last_digits?.replace(/\D/g, '').slice(-4) || null

    // 11. Enregistrement
    await db.from('transactions').delete().eq('import_id', importId)
    const rows = result.operations.map((op, position) => ({
      user_id: userId,
      import_id: importId,
      position,
      op_date: op.op_date,
      label: op.label,
      amount_cents: op.amount_cents,
      currency: result.currency,
      is_pending: op.is_pending,
      page: op.page,
      ai_category_code: op.category,
      ai_confidence: op.confidence,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insError } = await db.from('transactions').insert(rows.slice(i, i + 500))
      if (insError) throw insError
    }

    const bank = result.header.bank_name?.slice(0, 60) ?? null
    const accountLabel = (bank ?? 'Compte') + (accountLast4 ? ` ••${accountLast4}` : '')
    const accountId = await ensureBankAccount(db, userId, accountLabel, bank, accountLast4)
    await db
      .from('statement_imports')
      .update({
        status: 'needs_review',
        error_code: null,
        extraction_method: method,
        currency: result.currency,
        bank_name: bank,
        account_id: accountId,
        account_label: accountLabel,
        period_start: result.periodStart,
        period_end: result.periodEnd,
        opening_balance_cents: result.opening,
        closing_balance_cents: result.closing,
        balance_check: result.balanceCheck,
        balance_gap_cents: result.gap,
        operations_count: rows.length,
      })
      .eq('id', importId)
  } catch (e) {
    const code: ErrorCode = e instanceof ImportError ? e.code : 'processing_error'
    await logEvent(db, e instanceof ImportError ? 'warn' : 'error', 'process-statement', code, e instanceof Error && !(e instanceof ImportError) ? e.message : undefined, { import_id: importId })
    await db.from('transactions').delete().eq('import_id', importId)
    await db.from('statement_imports').update({ status: 'failed', error_code: code, operations_count: 0 }).eq('id', importId)
  }
}

/** Compte bancaire identifié (banque + 4 derniers chiffres), créé à la première rencontre. */
async function ensureBankAccount(db: ReturnType<typeof adminClient>, userId: string, label: string, bank: string | null, last4: string | null): Promise<string | null> {
  let query = db.from('bank_accounts').select('id').eq('user_id', userId).eq('label', label)
  query = bank ? query.eq('bank_name', bank) : query.is('bank_name', null)
  query = last4 ? query.eq('last4', last4) : query.is('last4', null)
  const { data: existing } = await query.maybeSingle()
  if (existing) return existing.id
  const { data: created } = await db.from('bank_accounts').insert({ user_id: userId, label, bank_name: bank, last4 }).select('id').single()
  return created?.id ?? null
}

/** Texte des pages, ou null si le document n'a pas de couche texte exploitable (scan). */
async function readPdf(bytes: Uint8Array): Promise<string[] | null> {
  let pdf
  try {
    pdf = await getDocumentProxy(bytes.slice())
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    throw new ImportError(name === 'PasswordException' ? 'encrypted' : 'not_pdf')
  }
  if (pdf.numPages > MAX_PAGES) throw new ImportError('too_long')
  const { text } = await extractText(pdf, { mergePages: false })
  const pages = (text as string[]).map((t) => t.replace(/[ \t]+/g, ' ').trim())
  const chars = pages.reduce((s, p) => s + p.length, 0)
  return chars < MIN_CHARS_PER_PAGE * pages.length ? null : pages
}

function chunkPages(pages: string[]): string[] {
  const chunks: string[] = []
  let current = ''
  pages.forEach((page, i) => {
    const block = `\n--- PAGE ${i + 1} ---\n${page}`
    if (current && current.length + block.length > CHUNK_CHARS) {
      chunks.push(current)
      current = ''
    }
    current += block
  })
  if (current) chunks.push(current)
  return chunks
}

async function loadCategories(): Promise<Category[]> {
  const { data, error: e } = await adminClient().from('categories').select('code, label, kind').eq('is_active', true).order('sort_order')
  if (e || !data) throw new ImportError('processing_error')
  return data
}

type Source = { kind: 'text'; text: string; first: boolean } | { kind: 'pdf'; bytes: Uint8Array }

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

async function extract(model: string, categories: Category[], source: Source): Promise<Extraction> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY manquante')

  const nullable = (type: string) => ({ type: [type, 'null'] })
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['is_bank_statement', 'bank_name', 'account_last_digits', 'currency', 'period_start', 'period_end', 'opening_balance', 'closing_balance', 'operations'],
    properties: {
      is_bank_statement: { type: 'boolean' },
      bank_name: nullable('string'),
      account_last_digits: nullable('string'),
      currency: nullable('string'),
      period_start: nullable('string'),
      period_end: nullable('string'),
      opening_balance: nullable('number'),
      closing_balance: nullable('number'),
      operations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'label', 'amount', 'is_pending', 'page', 'category', 'confidence'],
          properties: {
            date: { type: 'string' },
            label: { type: 'string' },
            amount: { type: 'number' },
            is_pending: { type: 'boolean' },
            page: nullable('integer'),
            category: { type: ['string', 'null'], enum: [...categories.map((c) => c.code), null] },
            confidence: { type: 'number' },
          },
        },
      },
    },
  }

  const ocr = source.kind === 'pdf'
  const instructions = [
    'Tu extrais les opérations d’un relevé de compte bancaire français.',
    'Règles :',
    '- Liste chaque opération une seule fois, dans l’ordre du relevé. Ignore les soldes, totaux, reports et en-têtes.',
    '- amount : en unités de la devise du compte, NÉGATIF pour un débit (sortie d’argent), POSITIF pour un crédit (entrée d’argent). Utilise la colonne débit/crédit pour déterminer le signe.',
    '- date : date de l’opération au format AAAA-MM-JJ (déduis l’année de la période du relevé).',
    '- label : libellé de l’opération tel qu’il apparaît, sans le montant.',
    '- is_pending : true uniquement pour une opération en attente, en cours, à venir ou non encore comptabilisée.',
    '- page : numéro de la page où figure l’opération (indiqué par « --- PAGE n --- » ou par la page du document), null si inconnu.',
    '- category : code de catégorie le plus probable parmi la liste, ou null si impossible à déterminer. Un crédit n’est un revenu (income) que s’il s’agit clairement d’un revenu ; un virement entre comptes du titulaire est « transfert_interne », un remboursement est « remboursement ».',
    '- confidence : ta certitude sur la catégorie, entre 0 et 1.',
    '- currency : code ISO de la devise du compte (EUR le plus souvent).',
    ocr
      ? '- account_last_digits : uniquement les 4 derniers chiffres du numéro de compte ou de l’IBAN, jamais le numéro complet. Ne recopie aucune autre donnée personnelle.'
      : '- account_last_digits : toujours null (les numéros de compte sont masqués). Les mentions [MASQUÉ] remplacent des données personnelles : ignore-les.',
    '- opening_balance / closing_balance : soldes en début et fin de la portion fournie, signés (négatif si débiteur), null si absents.',
    '- is_bank_statement : false si le document n’est pas un relevé de compte bancaire.',
    source.kind === 'text' && !source.first ? '- Ce texte est la suite d’un relevé : is_bank_statement=true, renseigne ce qui figure dans cette portion.' : '',
    '',
    'Catégories (code — libellé — type) :',
    ...categories.map((c) => `${c.code} — ${c.label} — ${c.kind}`),
  ].join('\n')

  const userContent =
    source.kind === 'text'
      ? source.text
      : [
          { type: 'file', file: { filename: 'releve.pdf', file_data: `data:application/pdf;base64,${toBase64(source.bytes)}` } },
          { type: 'text', text: 'Extrais les opérations de ce relevé scanné.' },
        ]

  const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'releve', strict: true, schema } },
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: userContent },
      ],
    }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}`)
  const body = await res.json()
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new Error('Réponse LLM vide')
  return JSON.parse(content) as Extraction
}

function validDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value
}

function toCents(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null
}

/** Normalise les résultats d'extraction et contrôle la cohérence des soldes. */
function normalize(results: Extraction[], validCodes: Set<string>) {
  const header = results[0]
  if (!header?.is_bank_statement) throw new ImportError('not_statement')
  const currency = (header.currency ?? 'EUR').toUpperCase().slice(0, 3)
  if (!SUPPORTED_CURRENCIES.has(currency)) throw new ImportError('unsupported_currency')

  const operations = results
    .flatMap((r) => r.operations)
    .map((op) => {
      const op_date = validDate(op.date)
      const amount_cents = toCents(op.amount)
      const label = op.label?.replace(/\s+/g, ' ').trim().slice(0, 300)
      if (!op_date || !amount_cents || !label) return null
      return {
        op_date,
        label,
        amount_cents,
        is_pending: op.is_pending === true,
        page: Number.isInteger(op.page) && op.page! > 0 && op.page! <= MAX_PAGES ? op.page : null,
        category: op.category && validCodes.has(op.category) ? op.category : null,
        confidence: Math.min(1, Math.max(0, Number(op.confidence) || 0)),
      }
    })
    .filter((op): op is NonNullable<typeof op> => op !== null)
  if (operations.length === 0) throw new ImportError('no_operations')

  const opening = toCents(header.opening_balance)
  const closing = toCents(results.at(-1)?.closing_balance ?? header.closing_balance)
  // Contrôle partagé avec le moteur (src/domain/balance.ts, testé).
  const { gap, check: balanceCheck } = checkStatementBalance(opening, closing, operations.map((o) => ({ amount: o.amount_cents, isPending: o.is_pending })))

  const dates = operations.map((o) => o.op_date).sort()
  let periodStart = validDate(header.period_start) ?? dates[0]
  let periodEnd = validDate(results.at(-1)?.period_end ?? header.period_end) ?? dates.at(-1)!
  if (periodStart > periodEnd) [periodStart, periodEnd] = [periodEnd, periodStart]

  return { header, currency, operations, opening, closing, gap, balanceCheck, periodStart, periodEnd }
}
