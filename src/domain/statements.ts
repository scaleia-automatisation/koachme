// Analyse déterministe des opérations extraites des relevés bancaires.
//
// Chaîne : catégorisation → virements entre comptes → doublons → récurrences
// → opérations exceptionnelles → opérations à confirmer → chiffres mensuels.
//
// L'IA (côté serveur) ne fournit qu'une suggestion de catégorie ; la décision
// suit toujours le même ordre de priorité :
//   1. correction de l'utilisateur sur l'opération
//   2. correction mémorisée pour ce marchand (historique)
//   3. virement détecté entre deux comptes importés
//   4. règle par mots-clés
//   5. suggestion de l'IA (si cohérente avec le sens de l'opération)
//   6. « À vérifier » (jamais compté tant que l'utilisateur n'a pas tranché)
//
// Règles financières garanties :
// - un crédit n'est pas automatiquement un revenu, un débit pas automatiquement une dépense ;
// - un virement entre comptes n'est jamais une dépense ni un revenu ;
// - un remboursement n'est jamais un revenu ;
// - une opération en attente n'est jamais comptée comme comptabilisée ;
// - les revenus et dépenses exceptionnels sont isolés des montants mensuels réguliers.

import type { BudgetEntry } from './budget'
import { getCategory, isCategoryCode, keywordRules, type CategoryCode, type CategoryKind } from './categories'
import type { Cents } from './money'
import { thresholds } from './status'

export type ReviewStatus = 'auto' | 'confirmed' | 'corrected'

export interface RawTransaction {
  id: string
  importId: string
  /** Date ISO (AAAA-MM-JJ). */
  opDate: string
  label: string
  /** Montant signé en centimes : négatif pour un débit, positif pour un crédit. */
  amount: Cents
  currency: string
  /** Opération en attente (non encore comptabilisée par la banque). */
  isPending: boolean
  aiCategoryCode: string | null
  aiConfidence: number | null
  userCategoryCode: string | null
  userExcluded: boolean | null
  userExceptional: boolean | null
  reviewStatus: ReviewStatus
  /** Page du relevé d'où provient l'opération (source). */
  page?: number | null
  /** Corrections de l'utilisateur sur les données extraites (montant, date, libellé). */
  userAmount?: Cents | null
  userOpDate?: string | null
  userLabel?: string | null
}

export interface ImportInfo {
  id: string
  /** Identifie le compte bancaire ; les relevés d'un même compte se cumulent dans le temps. */
  accountKey: string
  periodStart: string | null
  periodEnd: string | null
  closingBalance: Cents | null
  /** Date de création, pour départager les doublons (le plus ancien est conservé). */
  createdAt: string
}

export type CategorySource = 'user' | 'history' | 'transfer_match' | 'rule' | 'ai' | 'fallback'

/** Place de l'opération dans les calculs. */
export type Treatment = 'income' | 'expense' | 'savings' | 'refund' | 'transfer' | 'review' | 'pending' | 'excluded'

export interface AnalyzedTransaction extends RawTransaction {
  /** Valeurs extraites d'origine, si l'utilisateur a corrigé l'opération. */
  original: { amount: Cents; opDate: string; label: string } | null
  accountKey: string
  merchantKey: string
  categoryCode: CategoryCode
  categorySource: CategorySource
  isRecurring: boolean
  /** Doublon d'une opération d'un autre relevé (id de l'opération conservée). */
  duplicateOf: string | null
  /** Autre jambe d'un virement entre deux comptes importés. */
  transferPairId: string | null
  exceptional: boolean
  excluded: boolean
  needsReview: boolean
  treatment: Treatment
}

// ---------------------------------------------------------------------------
// Normalisation des libellés
// ---------------------------------------------------------------------------

const NOISE_PREFIXES = [
  'PAIEMENT PAR CARTE',
  'PAIEMENT CB',
  'PRELEVEMENT SEPA',
  'PRELEVEMENT',
  'PRLV SEPA',
  'PRLV',
  'VIREMENT SEPA RECU',
  'VIREMENT SEPA EMIS',
  'VIREMENT RECU',
  'VIREMENT EMIS',
  'VIREMENT EN VOTRE FAVEUR',
  'VIREMENT',
  'VIR SEPA RECU',
  'VIR SEPA',
  'VIR INST',
  'VIR',
  'CARTE X\\d+',
  'CARTE',
  'CB',
  'ACHAT CB',
  'RETRAIT DAB',
  'ECHEANCE',
  'DE:',
  'DE',
]
const MONTHS_RE = /\b(?:JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE|JANV|FEVR?|AVR|JUIL|SEPT?|OCT|NOV|DEC|20\d{2})\b/g
const PREFIX_RE = new RegExp(`^(?:(?:${NOISE_PREFIXES.join('|')})\\b[\\s:.-]*)+`)

export function normalizeLabel(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

/**
 * Clé marchand stable, utilisée pour mémoriser les corrections et détecter les
 * récurrences : « PRLV SEPA NETFLIX.COM 12/03 REF 8812 » → « NETFLIX COM ».
 */
export function merchantKey(label: string): string {
  const cleaned = normalizeLabel(label)
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ')
    .replace(/\b(?:REF|REFERENCE|MANDAT|ID|NUM|FACT|FACTURE|ECH|RUM|ICS)\b[:\s]*\S*/g, ' ')
    // Mois et années : « LOYER JANVIER 2026 » et « LOYER FEVRIER 2026 » sont le même marchand.
    .replace(MONTHS_RE, ' ')
    .replace(/[^A-Z0-9&' ]+/g, ' ')
    .replace(/\b\w*\d{3,}\w*\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const withoutPrefix = cleaned.replace(PREFIX_RE, '').trim() || cleaned
  return withoutPrefix.split(' ').slice(0, 3).join(' ')
}

// ---------------------------------------------------------------------------
// Catégorisation
// ---------------------------------------------------------------------------

const AUTO_KINDS_CREDIT: ReadonlySet<CategoryKind> = new Set(['income', 'savings', 'transfer', 'refund', 'review'])
const AUTO_KINDS_DEBIT: ReadonlySet<CategoryKind> = new Set(['expense', 'savings', 'transfer', 'review'])

/**
 * Une catégorie est-elle cohérente avec le sens de l'opération ?
 * - Classement automatique : un crédit ne peut être qu'un revenu, une épargne
 *   récupérée, un virement interne ou un remboursement ; un débit, une dépense,
 *   une épargne ou un virement interne.
 * - Choix de l'utilisateur : il peut en plus rattacher un crédit à une catégorie
 *   de dépense (ex. remboursement d'un achat), mais jamais un débit à un revenu.
 */
export function isCompatible(categoryCode: CategoryCode, amount: Cents, manual = false): boolean {
  const kind = getCategory(categoryCode).kind
  if (amount > 0) return AUTO_KINDS_CREDIT.has(kind) || (manual && kind === 'expense')
  return AUTO_KINDS_DEBIT.has(kind)
}

function keywordCategory(label: string, amount: Cents): CategoryCode | null {
  const text = normalizeLabel(label)
  for (const rule of keywordRules()) {
    if (rule.regex.test(text) && isCompatible(rule.categoryCode, amount)) return rule.categoryCode
  }
  return null
}

export function categorize(
  tx: Pick<RawTransaction, 'label' | 'amount' | 'aiCategoryCode' | 'aiConfidence' | 'userCategoryCode'>,
  rules: ReadonlyMap<string, string>,
): { categoryCode: CategoryCode; source: CategorySource; merchantKey: string } {
  const key = merchantKey(tx.label)
  const usable = (code: string | null | undefined, manual = false): code is CategoryCode =>
    !!code && isCategoryCode(code) && isCompatible(code, tx.amount, manual)

  if (usable(tx.userCategoryCode, true)) return { categoryCode: tx.userCategoryCode, source: 'user', merchantKey: key }
  const remembered = rules.get(key)
  if (usable(remembered, true)) return { categoryCode: remembered, source: 'history', merchantKey: key }
  const byKeyword = keywordCategory(tx.label, tx.amount)
  if (byKeyword) return { categoryCode: byKeyword, source: 'rule', merchantKey: key }
  if (usable(tx.aiCategoryCode)) return { categoryCode: tx.aiCategoryCode, source: 'ai', merchantKey: key }
  return { categoryCode: 'a_verifier', source: 'fallback', merchantKey: key }
}

// ---------------------------------------------------------------------------
// Analyse complète
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const monthOf = (isoDate: string) => isoDate.slice(0, 7)
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS

export function median(values: readonly number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const EXCEPTIONAL_INCOME_RE = /\b(PRIME|BONUS|INTERESSEMENT|PARTICIPATION|13E(ME)? MOIS|INDEMNITE|REGULARISATION|RAPPEL)\b/

const KIND_TREATMENT: Record<CategoryKind, Treatment> = {
  income: 'income',
  expense: 'expense',
  savings: 'savings',
  refund: 'refund',
  transfer: 'transfer',
  review: 'review',
}

export function analyzeTransactions(
  transactions: readonly RawTransaction[],
  imports: readonly ImportInfo[],
  rules: ReadonlyMap<string, string>,
): AnalyzedTransaction[] {
  const t = thresholds()
  const importById = new Map(imports.map((i) => [i.id, i]))
  const importOrder = new Map([...imports].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((imp, i) => [imp.id, i]))
  const order = (tx: RawTransaction) => importOrder.get(tx.importId) ?? Number.MAX_SAFE_INTEGER

  const base = transactions.map((raw) => {
    // Les corrections de l'utilisateur priment ; l'extraction d'origine reste disponible (original).
    const corrected = raw.userAmount != null || raw.userOpDate != null || raw.userLabel != null
    const tx = {
      ...raw,
      amount: raw.userAmount ?? raw.amount,
      opDate: raw.userOpDate ?? raw.opDate,
      label: raw.userLabel ?? raw.label,
      original: corrected ? { amount: raw.amount, opDate: raw.opDate, label: raw.label } : null,
    }
    const { categoryCode, source, merchantKey: key } = categorize(tx, rules)
    return { ...tx, accountKey: importById.get(tx.importId)?.accountKey ?? tx.importId, merchantKey: key, categoryCode, categorySource: source as CategorySource }
  })

  // 1. Doublons : même date, même montant, même marchand, dans deux relevés
  //    différents (relevés qui se chevauchent). La première occurrence est conservée.
  const firstSeen = new Map<string, (typeof base)[number]>()
  const duplicateOf = new Map<string, string>()
  for (const tx of [...base].sort((a, b) => order(a) - order(b))) {
    const signature = `${tx.opDate}|${tx.amount}|${tx.merchantKey}`
    const kept = firstSeen.get(signature)
    if (kept && kept.importId !== tx.importId) duplicateOf.set(tx.id, kept.id)
    else if (!kept) firstSeen.set(signature, tx)
  }

  // 2. Virements entre deux comptes importés : un débit sur un compte et un
  //    crédit du même montant sur un autre compte, à quelques jours d'écart.
  const pairOf = new Map<string, string>()
  const lockable = (tx: (typeof base)[number]) =>
    !duplicateOf.has(tx.id) && !tx.isPending && tx.categorySource !== 'user' && tx.categorySource !== 'history'
  const credits = base.filter((tx) => tx.amount > 0 && lockable(tx))
  for (const debit of base.filter((tx) => tx.amount < 0 && lockable(tx)).sort((a, b) => a.opDate.localeCompare(b.opDate))) {
    const match = credits.find(
      (c) => !pairOf.has(c.id) && c.accountKey !== debit.accountKey && c.amount === -debit.amount && dayDiff(c.opDate, debit.opDate) <= t.transferMatchDays,
    )
    if (match) {
      pairOf.set(debit.id, match.id)
      pairOf.set(match.id, debit.id)
    }
  }
  for (const tx of base) {
    if (pairOf.has(tx.id)) {
      tx.categoryCode = 'transfert_interne'
      tx.categorySource = 'transfer_match'
    }
  }

  // 3. Récurrences : même marchand, même sens, au moins deux mois différents,
  //    montants proches.
  const groups = new Map<string, typeof base>()
  for (const tx of base) {
    if (duplicateOf.has(tx.id) || tx.isPending) continue
    const k = `${tx.merchantKey}|${Math.sign(tx.amount)}`
    groups.set(k, [...(groups.get(k) ?? []), tx])
  }
  const recurring = new Set<string>()
  for (const group of groups.values()) {
    if (new Set(group.map((x) => monthOf(x.opDate))).size < 2) continue
    const ref = median(group.map((x) => Math.abs(x.amount)))
    const similar = group.filter((x) => Math.abs(Math.abs(x.amount) - ref) <= ref * t.recurringTolerance)
    if (new Set(similar.map((x) => monthOf(x.opDate))).size >= 2) similar.forEach((x) => recurring.add(x.id))
  }

  // 4. Référence de revenu régulier : médiane des revenus récurrents par mois.
  const regularIncomeByMonth = new Map<string, number>()
  for (const tx of base) {
    if (recurring.has(tx.id) && tx.amount > 0 && getCategory(tx.categoryCode).kind === 'income') {
      regularIncomeByMonth.set(monthOf(tx.opDate), (regularIncomeByMonth.get(monthOf(tx.opDate)) ?? 0) + tx.amount)
    }
  }
  const regularIncome = median([...regularIncomeByMonth.values()])

  return base.map((tx) => {
    const category = getCategory(tx.categoryCode)
    const dup = duplicateOf.get(tx.id) ?? null
    const excluded = tx.userExcluded ?? dup !== null
    const isRec = recurring.has(tx.id)

    // 5. Exceptionnel : jamais pour une charge fixe ni une dépense essentielle ; décision de l'utilisateur prioritaire.
    let exceptional = false
    if (tx.userExceptional !== null) exceptional = tx.userExceptional
    else if (category.kind === 'income' && !isRec) {
      exceptional = EXCEPTIONAL_INCOME_RE.test(normalizeLabel(tx.label)) || (regularIncome > 0 && tx.amount >= regularIncome * t.exceptionalIncomeRatio && tx.categoryCode === 'salaire')
    } else if (category.kind === 'expense' && !isRec && category.nature !== 'fixed' && !category.isEssential && tx.amount < 0) {
      const floor = Math.max(t.exceptionalExpenseMin, regularIncome * t.exceptionalExpenseRatio)
      exceptional = -tx.amount >= floor
    }

    const userDecided = tx.reviewStatus !== 'auto'
    const uncertain =
      tx.categorySource === 'fallback' ||
      (tx.categorySource === 'ai' && ((tx.aiConfidence ?? 0) < t.aiMinConfidence || Math.abs(tx.amount) >= t.importantAmount))
    const treatment: Treatment = excluded ? 'excluded' : tx.isPending ? 'pending' : KIND_TREATMENT[category.kind]

    return {
      ...tx,
      isRecurring: isRec,
      duplicateOf: dup,
      transferPairId: pairOf.get(tx.id) ?? null,
      exceptional,
      excluded,
      needsReview: !excluded && !tx.isPending && !userDecided && uncertain,
      treatment,
    }
  })
}

export interface ReviewGroup {
  merchantKey: string
  /** Sens des opérations du groupe : 1 crédit, -1 débit. */
  direction: 1 | -1
  categoryCode: CategoryCode
  transactions: AnalyzedTransaction[]
  total: Cents
}

/**
 * Regroupe les opérations à confirmer par marchand : une seule décision
 * s'applique à toutes les opérations du groupe (et aux imports futurs).
 * Les groupes au montant total le plus élevé apparaissent en premier.
 */
export function groupForReview(transactions: readonly AnalyzedTransaction[]): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>()
  for (const tx of transactions) {
    if (!tx.needsReview) continue
    const direction = tx.amount > 0 ? 1 : -1
    const k = `${tx.merchantKey}|${direction}`
    const g = groups.get(k) ?? { merchantKey: tx.merchantKey, direction, categoryCode: tx.categoryCode, transactions: [], total: 0 }
    g.transactions.push(tx)
    g.total += Math.abs(tx.amount)
    groups.set(k, g)
  }
  return [...groups.values()].sort((a, b) => b.total - a.total)
}

// ---------------------------------------------------------------------------
// Périodes
// ---------------------------------------------------------------------------

/** Fraction de mois calendaires couverte par un intervalle (1er janv. → 28 févr. = exactement 2). */
function calendarMonths(start: number, end: number): number {
  let months = 0
  let cursor = start
  while (cursor <= end) {
    const d = new Date(cursor)
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    const daysInMonth = (nextMonth - monthStart) / DAY_MS
    const segmentEnd = Math.min(end, nextMonth - DAY_MS)
    months += ((segmentEnd - cursor) / DAY_MS + 1) / daysInMonth
    cursor = nextMonth
  }
  return months
}

interface Interval {
  s: number
  e: number
}

function mergeIntervals(periods: readonly { start: string; end: string }[]): Interval[] {
  const sorted = periods.map((p) => ({ s: Date.parse(`${p.start}T00:00:00Z`), e: Date.parse(`${p.end}T00:00:00Z`) })).sort((a, b) => a.s - b.s)
  const merged: Interval[] = []
  for (const p of sorted) {
    const last = merged.at(-1)
    if (last && p.s <= last.e + DAY_MS) last.e = Math.max(last.e, p.e)
    else merged.push({ ...p })
  }
  return merged
}

/** Nombre de mois couverts (au minimum 1), à partir des périodes des relevés d'un compte. */
export function coveredMonths(periods: readonly { start: string; end: string }[]): number {
  if (!periods.length) return 1
  return Math.max(1, mergeIntervals(periods).reduce((sum, i) => sum + calendarMonths(i.s, i.e), 0))
}

/** Part couverte de chaque mois calendaire (« 2026-01 » → 1, « 2026-02 » → 0,5…). */
export function monthCoverage(periods: readonly { start: string; end: string }[]): Map<string, number> {
  const coverage = new Map<string, number>()
  for (const { s, e } of mergeIntervals(periods)) {
    let cursor = s
    while (cursor <= e) {
      const d = new Date(cursor)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
      coverage.set(key, (coverage.get(key) ?? 0) + calendarMonths(cursor, Math.min(e, nextMonth - DAY_MS)))
      cursor = nextMonth
    }
  }
  return coverage
}

// ---------------------------------------------------------------------------
// Chiffres issus des relevés
// ---------------------------------------------------------------------------

export interface RecurringItem {
  merchantKey: string
  label: string
  categoryCode: CategoryCode
  direction: 1 | -1
  /** Montant habituel (médiane), en valeur absolue. */
  typicalAmount: Cents
  occurrences: number
  /** Jour du mois habituel de l'opération. */
  typicalDay: number
  lastAmount: Cents
  previousAmount: Cents | null
}

export interface AccountPosition {
  accountKey: string
  periodStart: string
  periodEnd: string
  months: number
  /** Solde des opérations de la période (entrées − sorties, hors opérations en attente). */
  netFlow: Cents
  closingBalance: Cents | null
  /** Débits récurrents connus attendus d'ici la fin du mois suivant la fin du relevé. */
  upcomingCommitments: Cents
  /** Solde après engagements connus (null si le solde final est inconnu). */
  availableAfterCommitments: Cents | null
  pendingTotal: Cents
}

export interface CategoryMonth {
  month: string
  /** Montant normalisé sur un mois complet. */
  amount: Cents
  /** Part du mois couverte par les relevés (1 = mois complet). */
  coverage: number
}

export interface StatementFigures {
  /** Montants mensuels réguliers par catégorie (exceptionnels, transferts, à vérifier et en attente exclus). */
  entries: BudgetEntry[]
  monthsByAccount: Record<string, number>
  /** Période de référence globale. */
  period: { start: string; end: string } | null
  exceptionalIncome: AnalyzedTransaction[]
  exceptionalExpenses: AnalyzedTransaction[]
  toConfirm: { count: number; credits: Cents; debits: Cents }
  pending: { count: number; total: Cents }
  transfers: { count: number; total: Cents }
  recurring: RecurringItem[]
  accounts: AccountPosition[]
  /** Évolution mensuelle normalisée des dépenses par catégorie. */
  monthlyByCategory: Map<CategoryCode, CategoryMonth[]>
}

/** Contribution d'une opération à sa catégorie, en valeur positive « habituelle ». */
function contribution(tx: AnalyzedTransaction): number {
  const kind = getCategory(tx.categoryCode).kind
  // Revenus et remboursements : crédits positifs. Dépenses et épargne : débits comptés en positif, crédits en déduction.
  return kind === 'income' || kind === 'refund' ? tx.amount : -tx.amount
}

export function statementFigures(transactions: readonly AnalyzedTransaction[], imports: readonly ImportInfo[]): StatementFigures {
  const byAccount = new Map<string, AnalyzedTransaction[]>()
  for (const tx of transactions) byAccount.set(tx.accountKey, [...(byAccount.get(tx.accountKey) ?? []), tx])

  const totals = new Map<CategoryCode, number>()
  const monthsByAccount: Record<string, number> = {}
  const accounts: AccountPosition[] = []
  const monthly = new Map<CategoryCode, Map<string, { amount: number; coverage: number }>>()
  let globalStart = null as string | null
  let globalEnd = null as string | null

  // Récurrences (calculées d'abord : elles servent aux engagements à venir).
  const recurring = recurringItems(transactions)

  for (const [account, txs] of byAccount) {
    const accountImports = imports.filter((i) => i.accountKey === account)
    const periods = accountImports
      .map((imp) => {
        const own = txs.filter((x) => x.importId === imp.id).map((x) => x.opDate).sort()
        return { start: imp.periodStart ?? own[0], end: imp.periodEnd ?? own[own.length - 1] }
      })
      .filter((p): p is { start: string; end: string } => !!p.start && !!p.end)
    if (!periods.length) continue
    const months = coveredMonths(periods)
    const coverage = monthCoverage(periods)
    monthsByAccount[account] = months
    const start = periods.map((p) => p.start).sort()[0]
    const end = periods.map((p) => p.end).sort().at(-1)!
    globalStart = !globalStart || start < globalStart ? start : globalStart
    globalEnd = !globalEnd || end > globalEnd ? end : globalEnd

    const perCategory = new Map<CategoryCode, number>()
    for (const tx of txs) {
      if (!['income', 'expense', 'savings', 'refund'].includes(tx.treatment) || tx.exceptional) continue
      perCategory.set(tx.categoryCode, (perCategory.get(tx.categoryCode) ?? 0) + contribution(tx))
      if (tx.treatment === 'expense') {
        const m = monthOf(tx.opDate)
        const cat = monthly.get(tx.categoryCode) ?? new Map()
        const cell = cat.get(m) ?? { amount: 0, coverage: coverage.get(m) ?? 1 }
        cell.amount += contribution(tx)
        cat.set(m, cell)
        monthly.set(tx.categoryCode, cat)
      }
    }
    for (const [code, total] of perCategory) totals.set(code, (totals.get(code) ?? 0) + total / months)

    // Position du compte : solde des opérations, solde final et engagements à venir.
    const lastImport = [...accountImports].filter((i) => i.periodEnd).sort((a, b) => (a.periodEnd! < b.periodEnd! ? 1 : -1))[0]
    const settled = txs.filter((x) => !x.duplicateOf && !x.isPending)
    const netFlow = settled.reduce((s, x) => s + x.amount, 0)
    const accountKeys = new Set(txs.map((x) => x.merchantKey))
    const accountRecurring = recurring.filter((r) => accountKeys.has(r.merchantKey))
    // Horizon : prochain versement du revenu principal (le plus élevé), sinon 30 jours.
    const mainIncome = accountRecurring
      .filter((r) => r.direction > 0 && getCategory(r.categoryCode).kind === 'income')
      .sort((x, y) => y.typicalAmount - x.typicalAmount)[0]
    const horizon = mainIncome ? nextOccurrence(end, mainIncome.typicalDay) : addDays(end, 30)
    const upcoming = accountRecurring
      .filter((r) => r.direction < 0 && ['expense', 'savings'].includes(getCategory(r.categoryCode).kind))
      .filter((r) => nextOccurrence(end, r.typicalDay) < horizon)
      .reduce((s, r) => s + r.typicalAmount, 0)
    const closing = lastImport?.closingBalance ?? null
    const pendingTx = txs.filter((x) => x.isPending && !x.excluded)
    const pendingTotal = pendingTx.reduce((s, x) => s + x.amount, 0)
    accounts.push({
      accountKey: account,
      periodStart: start,
      periodEnd: end,
      months,
      netFlow,
      closingBalance: closing,
      upcomingCommitments: upcoming,
      availableAfterCommitments: closing === null ? null : closing + Math.min(0, pendingTotal) - upcoming,
      pendingTotal,
    })
  }

  const entries = roundPreservingTotals(totals).filter((e) => e.amount > 0)

  const monthlyByCategory = new Map<CategoryCode, CategoryMonth[]>()
  for (const [code, months] of monthly) {
    monthlyByCategory.set(
      code,
      [...months.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { amount, coverage }]) => ({ month, amount: Math.round(amount / Math.max(coverage, 0.01)), coverage: Math.min(1, coverage) })),
    )
  }

  const counted = (tx: AnalyzedTransaction) => !tx.excluded && !tx.isPending
  const review = transactions.filter((x) => counted(x) && x.treatment === 'review')
  const transfers = transactions.filter((x) => counted(x) && x.treatment === 'transfer')
  const pending = transactions.filter((x) => !x.excluded && x.isPending)

  return {
    entries,
    monthsByAccount,
    period: globalStart && globalEnd ? { start: globalStart, end: globalEnd } : null,
    exceptionalIncome: transactions.filter((x) => counted(x) && x.exceptional && x.treatment === 'income'),
    exceptionalExpenses: transactions.filter((x) => counted(x) && x.exceptional && x.treatment === 'expense'),
    toConfirm: {
      count: review.length,
      credits: review.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0),
      debits: review.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0),
    },
    pending: { count: pending.length, total: pending.reduce((s, x) => s + x.amount, 0) },
    transfers: { count: transfers.length, total: transfers.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0) },
    recurring,
    accounts,
    monthlyByCategory,
  }
}

/**
 * Arrondit les moyennes mensuelles au centime sans fausser les totaux : pour
 * chaque nature de montant (revenus, dépenses, épargne, remboursements), la
 * somme des catégories arrondies est égale au total exact arrondi (méthode du
 * plus fort reste). Sans cela, des catégories arrondies une à une peuvent
 * décaler le total affiché de quelques centimes.
 */
function roundPreservingTotals(totals: ReadonlyMap<CategoryCode, number>): BudgetEntry[] {
  const byKind = new Map<string, [CategoryCode, number][]>()
  for (const [code, value] of totals) {
    if (value <= 0) continue
    const kind = getCategory(code).kind
    byKind.set(kind, [...(byKind.get(kind) ?? []), [code, value]])
  }
  const entries: BudgetEntry[] = []
  for (const items of byKind.values()) {
    const floors = items.map(([, v]) => Math.floor(v))
    let remainder = Math.round(items.reduce((s, [, v]) => s + v, 0)) - floors.reduce((s, f) => s + f, 0)
    const order = items.map(([, v], i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i)
    for (const { i } of order) {
      if (remainder <= 0) break
      floors[i] += 1
      remainder -= 1
    }
    items.forEach(([categoryCode], i) => entries.push({ categoryCode, amount: floors[i], frequency: 'monthly' }))
  }
  return entries
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Prochaine date (strictement après `after`) tombant le jour `day` du mois (ramené à la fin du mois si besoin). */
export function nextOccurrence(after: string, day: number): string {
  const d = new Date(`${after}T00:00:00Z`)
  for (let offset = 0; offset < 2; offset++) {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + offset
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const candidate = new Date(Date.UTC(y, m, Math.min(day, lastDay))).toISOString().slice(0, 10)
    if (candidate > after) return candidate
  }
  return addDays(after, 31)
}

/** Opérations récurrentes regroupées par marchand (hors mouvements internes et doublons). */
export function recurringItems(transactions: readonly AnalyzedTransaction[]): RecurringItem[] {
  const groups = new Map<string, AnalyzedTransaction[]>()
  for (const tx of transactions) {
    if (!tx.isRecurring || tx.excluded || tx.treatment === 'transfer') continue
    const k = `${tx.merchantKey}|${Math.sign(tx.amount)}`
    groups.set(k, [...(groups.get(k) ?? []), tx])
  }
  return [...groups.values()]
    .map((txs) => {
      const sorted = [...txs].sort((a, b) => a.opDate.localeCompare(b.opDate))
      const last = sorted.at(-1)!
      return {
        merchantKey: last.merchantKey,
        label: last.label,
        categoryCode: last.categoryCode,
        direction: (last.amount > 0 ? 1 : -1) as 1 | -1,
        typicalAmount: Math.round(median(sorted.map((x) => Math.abs(x.amount)))),
        occurrences: sorted.length,
        typicalDay: Math.round(median(sorted.map((x) => Number(x.opDate.slice(8, 10))))),
        lastAmount: Math.abs(last.amount),
        previousAmount: sorted.length > 1 ? Math.abs(sorted[sorted.length - 2].amount) : null,
      }
    })
    .sort((a, b) => b.typicalAmount - a.typicalAmount)
}

export interface CategoryTrend {
  categoryCode: CategoryCode
  previous: CategoryMonth
  last: CategoryMonth
  change: Cents
  /** Variation relative (null si le mois précédent est nul). */
  ratio: number | null
}

/**
 * Évolution des dépenses par catégorie entre les deux derniers mois
 * suffisamment couverts (au moins la moitié du mois). Les montants sont
 * normalisés sur un mois complet : un mois partiel n'est jamais comparé brut.
 */
export function categoryTrends(monthlyByCategory: ReadonlyMap<CategoryCode, CategoryMonth[]>, minCoverage = 0.5): CategoryTrend[] {
  const trends: CategoryTrend[] = []
  const allMonths = new Set<string>()
  for (const months of monthlyByCategory.values()) months.forEach((m) => m.coverage >= minCoverage && allMonths.add(m.month))
  const sortedMonths = [...allMonths].sort()
  if (sortedMonths.length < 2) return trends
  const [prevMonth, lastMonth] = sortedMonths.slice(-2)
  for (const [code, months] of monthlyByCategory) {
    const find = (m: string) => months.find((x) => x.month === m) ?? { month: m, amount: 0, coverage: 1 }
    const previous = find(prevMonth)
    const last = find(lastMonth)
    if (!previous.amount && !last.amount) continue
    trends.push({ categoryCode: code, previous, last, change: last.amount - previous.amount, ratio: previous.amount > 0 ? (last.amount - previous.amount) / previous.amount : null })
  }
  return trends.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}
