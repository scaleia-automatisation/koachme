// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Orchestration de l'analyse complète, à partir des données brutes de
// l'utilisateur. Fonction pure, utilisée à l'identique par l'interface
// (useAnalysis) et par le serveur (coach IA) : les chiffres présentés et
// ceux transmis à l'IA sont toujours les mêmes.

import { summarizeBudget } from './budget.ts'
import { assessCompleteness, type FinancialSituation } from './completeness.ts'
import { diagnose, potentialSavings } from './diagnosis.ts'
import { goalProgress, type SavingsGoal } from './goals.ts'
import type { Cents } from './money.ts'
import { monthlyHistory } from './monthly.ts'
import { buildRecommendations, confirmedSavings, keyPoints, topPriorities, type ActionStatus, type SubscriptionVerdict } from './recommendations.ts'
import { mergeBudgetSources, type DeclaredEntry } from './sources.ts'
import { analyzeTransactions, categoryTrends, statementFigures, type ImportInfo, type RawTransaction } from './statements.ts'

export interface ImportRecord extends ImportInfo {
  status: 'uploaded' | 'processing' | 'needs_review' | 'confirmed' | 'failed'
  balanceCheck: 'ok' | 'mismatch' | 'unknown'
}

export interface AnalysisInput {
  declared: readonly DeclaredEntry[]
  imports: readonly ImportRecord[]
  transactions: readonly RawTransaction[]
  /** Corrections mémorisées par marchand. */
  rules: ReadonlyMap<string, string>
  situation: FinancialSituation | null
  goals: readonly SavingsGoal[]
  actions?: ReadonlyMap<string, { status: ActionStatus; confirmedSaving: Cents | null }>
  subscriptionVerdicts?: ReadonlyMap<string, SubscriptionVerdict>
  /** Date du jour ISO (passée explicitement pour des calculs reproductibles). */
  today: string
}

/**
 * Un relevé entre dans le bilan une fois analysé, sauf s'il présente un écart
 * avec ses soldes : il n'est alors compté qu'après vérification par l'utilisateur.
 */
export function isImportCounted(i: Pick<ImportRecord, 'status' | 'balanceCheck'>): boolean {
  return i.status === 'confirmed' || (i.status === 'needs_review' && i.balanceCheck !== 'mismatch')
}

export function computeAnalysis(input: AnalysisInput) {
  const analyzable = input.imports.filter((i) => i.status === 'needs_review' || i.status === 'confirmed')
  const analyzableIds = new Set(analyzable.map((i) => i.id))
  const analyzed = analyzeTransactions(
    input.transactions.filter((t) => analyzableIds.has(t.importId)),
    analyzable,
    input.rules,
  )

  const counted = analyzable.filter(isImportCounted)
  const countedIds = new Set(counted.map((i) => i.id))
  const countedTx = analyzed.filter((t) => countedIds.has(t.importId))
  const figures = statementFigures(countedTx, counted)
  const history = monthlyHistory(countedTx, counted)
  const excludedImports = analyzable.filter((i) => !isImportCounted(i))

  const merged = mergeBudgetSources(input.declared, figures.entries)
  const summary = summarizeBudget(merged.entries)
  const capacity = summary.savings + Math.max(0, summary.balance)
  const goals = input.goals.map((g) => goalProgress(g, capacity, input.today))
  const diagnosis = diagnose({ summary, figures: counted.length ? figures : null, plannedVsActual: merged.plannedVsActual, situation: input.situation, goals })
  const trends = categoryTrends(figures.monthlyByCategory)
  const comparableMonths = new Set([...figures.monthlyByCategory.values()].flat().filter((m) => m.coverage >= 0.5).map((m) => m.month)).size

  const statementMonths = Math.max(0, ...Object.values(figures.monthsByAccount))
  const unconfirmed = new Set(counted.filter((i) => i.status === 'needs_review').map((i) => i.id))
  const pendingReviewCount = analyzed.filter((t) => t.needsReview && unconfirmed.has(t.importId)).length
  const completeness = assessCompleteness({
    entries: merged.entries,
    situation: input.situation,
    statementMonths,
    pendingReviewCount,
    unclassifiedAmount: figures.toConfirm.credits + figures.toConfirm.debits,
    excludedImportCount: excludedImports.length,
    incomeSource: merged.incomeSource,
    expensesSource: merged.expensesSource,
    hasClosingBalance: figures.accounts.some((a) => a.closingBalance !== null),
    comparableMonths,
  })

  const recommendations = buildRecommendations({
    summary,
    figures: counted.length ? figures : null,
    diagnosis,
    completeness,
    situation: input.situation,
    goals,
    actions: input.actions,
    subscriptionVerdicts: input.subscriptionVerdicts,
  })

  return {
    analyzed,
    figures,
    history,
    excludedImports,
    merged,
    summary,
    diagnosis,
    completeness,
    trends,
    goals,
    capacity,
    potential: potentialSavings(summary),
    recommendations,
    priorities: topPriorities(recommendations),
    confirmedSavings: confirmedSavings(recommendations),
    keyPoints: keyPoints(summary, counted.length ? figures : null, diagnosis),
    statementMonths,
    pendingReviewCount,
    hasData: merged.entries.length > 0,
  }
}

export type AnalysisResult = ReturnType<typeof computeAnalysis>
