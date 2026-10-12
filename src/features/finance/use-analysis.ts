// Analyse unique, quel que soit le parcours : toutes les données de
// l'utilisateur alimentent computeAnalysis (src/domain), la même fonction que
// celle utilisée par le coach IA côté serveur. Aucun chiffre n'est calculé ailleurs.
import { useMemo } from 'react'
import { computeAnalysis, type ImportRecord } from '@/domain'
import {
  toImportInfo,
  useBudgetEntries,
  useCategoryRules,
  useGoals,
  useImports,
  useRecommendationActions,
  useSituation,
  useSubscriptionReviews,
  useTransactions,
  type StatementImport,
} from './api'

export function toImportRecord(i: StatementImport): ImportRecord {
  return { ...toImportInfo(i), status: i.status, balanceCheck: i.balance_check }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export function useAnalysis() {
  const entries = useBudgetEntries()
  const situation = useSituation()
  const imports = useImports()
  const transactions = useTransactions()
  const rules = useCategoryRules()
  const goals = useGoals()
  const actions = useRecommendationActions()
  const verdicts = useSubscriptionReviews()

  const queries = [entries, situation, imports, transactions, rules, goals, actions, verdicts]
  const isLoading = queries.some((q) => q.isLoading)
  const error = queries.find((q) => q.error)?.error ?? null
  const refetch = () => queries.forEach((q) => void q.refetch())

  const result = useMemo(() => {
    if (!entries.data || !imports.data || !transactions.data || !rules.data || !goals.data || !actions.data || !verdicts.data || situation.data === undefined) return null
    const analysis = computeAnalysis({
      declared: entries.data,
      imports: imports.data.map(toImportRecord),
      transactions: transactions.data,
      rules: rules.data,
      situation: situation.data,
      goals: goals.data,
      actions: actions.data,
      subscriptionVerdicts: verdicts.data,
      today: todayIso(),
    })
    const excludedIds = new Set(analysis.excludedImports.map((i) => i.id))
    return {
      ...analysis,
      declared: entries.data,
      situation: situation.data,
      imports: imports.data,
      excludedImports: imports.data.filter((i) => excludedIds.has(i.id)),
    }
  }, [entries.data, imports.data, transactions.data, rules.data, goals.data, actions.data, verdicts.data, situation.data])

  return { isLoading, error, refetch, data: result }
}

export type Analysis = NonNullable<ReturnType<typeof useAnalysis>['data']>
