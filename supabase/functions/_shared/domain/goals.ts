// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Objectifs d'épargne : progression, reste à atteindre, effort mensuel et
// délai estimé. Le montant actuel ne progresse qu'avec des contributions
// confirmées par l'utilisateur : un virement n'est jamais affecté
// automatiquement à un objectif.

import type { Cents } from './money.ts'
import type { AnalyzedTransaction } from './statements.ts'

export type GoalKind = 'emergency_fund' | 'purchase' | 'vacation' | 'debt_reduction' | 'unexpected_reserve' | 'other'

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  emergency_fund: 'Épargne de précaution',
  purchase: 'Achat',
  vacation: 'Vacances',
  debt_reduction: 'Réduction d’une dette',
  unexpected_reserve: 'Réserve pour imprévus',
  other: 'Autre objectif',
}

export interface SavingsGoal {
  id: string
  name: string
  kind?: GoalKind
  targetAmount: Cents
  /** Montant de départ déclaré à la création. */
  savedAmount: Cents
  /** Somme des contributions confirmées depuis. */
  contributionsTotal?: Cents
  /** Contribution périodique prévue (facultative), par mois. */
  monthlyContribution?: Cents | null
  /** Échéance ISO (AAAA-MM-JJ), facultative. */
  targetDate: string | null
}

export interface GoalProgress {
  goal: SavingsGoal
  current: Cents
  reached: boolean
  remaining: Cents
  /** Avancement entre 0 et 1. */
  progress: number
  daysLeft: number | null
  monthsLeft: number | null
  /** Effort mensuel nécessaire pour tenir l'échéance (null sans échéance). */
  requiredMonthly: Cents | null
  /** L'effort nécessaire est-il couvert ? (contribution prévue, sinon capacité d'épargne) */
  onTrack: boolean | null
  /** Délai estimé pour atteindre l'objectif, si calculable. */
  estimate: { months: number; date: string; basis: 'contribution' | 'capacity' } | null
}

const DAY_MS = 86_400_000
const MONTH_DAYS = 365.25 / 12

function addMonths(iso: string, months: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + Math.ceil(months * MONTH_DAYS) * DAY_MS).toISOString().slice(0, 10)
}

/**
 * @param monthlyCapacity Capacité d'épargne mensuelle estimée (épargne programmée + reste positif).
 * @param today Date du jour (ISO), passée explicitement pour des calculs reproductibles.
 */
export function goalProgress(goal: SavingsGoal, monthlyCapacity: Cents, today: string): GoalProgress {
  const current = goal.savedAmount + (goal.contributionsTotal ?? 0)
  const remaining = Math.max(0, goal.targetAmount - current)
  const reached = remaining === 0
  const progress = goal.targetAmount > 0 ? Math.min(1, Math.max(0, current / goal.targetAmount)) : 1

  const pace = goal.monthlyContribution && goal.monthlyContribution > 0 ? goal.monthlyContribution : monthlyCapacity > 0 ? monthlyCapacity : 0
  const basis: 'contribution' | 'capacity' | null = goal.monthlyContribution && goal.monthlyContribution > 0 ? 'contribution' : monthlyCapacity > 0 ? 'capacity' : null
  const estimate = !reached && pace > 0 && basis ? { months: remaining / pace, date: addMonths(today, remaining / pace), basis } : null

  if (!goal.targetDate || reached) {
    return { goal, current, reached, remaining, progress, daysLeft: null, monthsLeft: null, requiredMonthly: reached ? 0 : null, onTrack: reached ? true : null, estimate }
  }
  const daysLeft = Math.ceil((Date.parse(`${goal.targetDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
  const monthsLeft = Math.max(0, daysLeft / MONTH_DAYS)
  const requiredMonthly = monthsLeft >= 1 ? Math.ceil(remaining / monthsLeft) : remaining
  return { goal, current, reached, remaining, progress, daysLeft, monthsLeft, requiredMonthly, onTrack: daysLeft > 0 && requiredMonthly <= pace, estimate }
}

/**
 * Virements d'épargne identifiés sur les relevés qui pourraient alimenter un
 * objectif. Ce ne sont que des suggestions : l'utilisateur confirme (ou non)
 * le rattachement et le montant.
 */
export function contributionSuggestions(transactions: readonly AnalyzedTransaction[], linkedTransactionIds: ReadonlySet<string>): AnalyzedTransaction[] {
  return transactions
    .filter((t) => t.treatment === 'savings' && t.amount < 0 && !linkedTransactionIds.has(t.id))
    .sort((a, b) => b.opDate.localeCompare(a.opDate))
}
