// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Fiabilité du diagnostic : quelles informations manquent, quel est leur
// impact, et quelles conclusions sont fiables ou seulement estimées. Un
// premier bilan est toujours possible ; aucun montant absent n'est inventé.

import type { BudgetEntry } from './budget.ts'
import { getCategory } from './categories.ts'
import { formatEuros, type Cents } from './money.ts'
import type { FigureSource } from './sources.ts'

export type FinancialGoal =
  | 'end_month_comfortably'
  | 'build_emergency_fund'
  | 'reduce_debt'
  | 'save_for_project'
  | 'prepare_retirement'
  | 'other'

export const GOAL_LABELS: Record<FinancialGoal, string> = {
  end_month_comfortably: 'Finir le mois plus sereinement',
  build_emergency_fund: 'Constituer une épargne de précaution',
  reduce_debt: 'Réduire mes dettes',
  save_for_project: 'Épargner pour un projet',
  prepare_retirement: 'Préparer ma retraite',
  other: 'Autre objectif',
}

export interface FinancialSituation {
  savingsAvailable: number | null
  debtRemaining: number | null
  hasPaymentDelays: boolean | null
  mainGoal: FinancialGoal | null
  householdSize: number | null
}

export interface CompletenessInput {
  entries: readonly BudgetEntry[]
  situation: FinancialSituation | null
  /** Nombre de mois couverts par les relevés (0 si aucun relevé). */
  statementMonths: number
  /** Opérations importées encore à confirmer. */
  pendingReviewCount: number
  /** Montant des opérations « à vérifier », non comptées (débits + crédits). */
  unclassifiedAmount?: Cents
  /** Relevés écartés du calcul (écart de solde non validé). */
  excludedImportCount?: number
  incomeSource?: FigureSource
  expensesSource?: FigureSource
  /** Au moins un solde final de relevé connu. */
  hasClosingBalance?: boolean
  /** Au moins deux mois comparables (couverts à plus de 50 %). */
  comparableMonths?: number
}

export type MissingKey =
  | 'income'
  | 'statements_without_income'
  | 'housing'
  | 'food'
  | 'fixed_charges'
  | 'savings_available'
  | 'debt'
  | 'goal'
  | 'household'
  | 'short_statement_period'
  | 'pending_review'
  | 'unclassified'
  | 'excluded_import'

export interface MissingItem {
  key: MissingKey
  label: string
  impact: string
  /** Poids dans le score de fiabilité. */
  weight: number
  /** Où compléter l'information. */
  step: 'income' | 'income_off_statement' | 'fixed' | 'variable' | 'situation' | 'review'
}

const ITEMS: Record<MissingKey, Omit<MissingItem, 'key'>> = {
  income: { label: 'Aucun revenu', impact: 'Sans revenu, aucun reste budgétaire ni taux d’épargne ne peut être calculé.', weight: 40, step: 'income' },
  statements_without_income: {
    label: 'Aucun revenu sur vos relevés',
    impact: 'Votre revenu est peut-être versé sur un autre compte : importez ce relevé ou déclarez ce revenu.',
    weight: 35,
    step: 'income_off_statement',
  },
  housing: { label: 'Logement non renseigné', impact: 'Le logement est souvent la première dépense : votre reste budgétaire est probablement surestimé.', weight: 15, step: 'fixed' },
  fixed_charges: { label: 'Peu de charges fixes', impact: 'Énergie, téléphone, assurances : sans elles, vos charges contraintes sont sous-estimées.', weight: 10, step: 'fixed' },
  food: { label: 'Courses non renseignées', impact: 'Les courses représentent une part importante du budget : les dépenses courantes sont sous-estimées.', weight: 10, step: 'variable' },
  savings_available: { label: 'Épargne disponible inconnue', impact: 'Nous ne pouvons pas estimer combien de mois vous pourriez tenir en cas d’imprévu.', weight: 5, step: 'situation' },
  debt: { label: 'Dettes non précisées', impact: 'Le niveau d’endettement global ne peut pas être évalué.', weight: 5, step: 'situation' },
  goal: { label: 'Objectif non choisi', impact: 'Les recommandations resteront générales.', weight: 5, step: 'situation' },
  household: { label: 'Taille du foyer inconnue', impact: 'Les comparaisons de dépenses (courses, énergie) seront moins pertinentes.', weight: 3, step: 'situation' },
  short_statement_period: {
    label: 'Relevés sur moins de trois mois',
    impact: 'Les charges trimestrielles ou annuelles (assurances, impôts…) peuvent être absentes ou surestimées : ajoutez un relevé supplémentaire.',
    weight: 7,
    step: 'review',
  },
  pending_review: { label: 'Opérations à confirmer', impact: 'Certaines opérations ont une catégorie incertaine : leur classement peut fausser l’analyse.', weight: 10, step: 'review' },
  unclassified: { label: 'Opérations non classées', impact: '', weight: 10, step: 'review' },
  excluded_import: {
    label: 'Relevé non pris en compte',
    impact: 'Un relevé présente un écart avec ses soldes : il n’est pas compté tant que vous ne l’avez pas vérifié.',
    weight: 10,
    step: 'review',
  },
}

export type Reliability = 'high' | 'medium' | 'low'

export const RELIABILITY_LABELS: Record<Reliability, string> = {
  high: 'Fiabilité élevée',
  medium: 'Fiabilité moyenne',
  low: 'Fiabilité limitée',
}

export type ConclusionLevel = 'fiable' | 'estime' | 'indisponible'

export interface Conclusion {
  label: string
  level: ConclusionLevel
  reason: string
}

export interface CompletenessResult {
  /** Score de 0 à 100. */
  score: number
  reliability: Reliability
  missing: MissingItem[]
  conclusions: Conclusion[]
}

function figureConclusion(label: string, source: FigureSource | undefined, months: number): Conclusion {
  switch (source) {
    case 'statements':
      return months >= 2.9
        ? { label, level: 'fiable', reason: `Constaté sur vos relevés (${months.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois)` }
        : { label, level: 'estime', reason: `Moyenne constatée sur une période courte (${months.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois)` }
    case 'mixed':
      return { label, level: 'estime', reason: 'Constaté sur vos relevés et complété par vos déclarations' }
    case 'declared':
      return { label, level: 'estime', reason: 'Basé sur les montants que vous avez déclarés' }
    default:
      return { label, level: 'indisponible', reason: 'Aucune donnée' }
  }
}

export function assessCompleteness(input: CompletenessInput): CompletenessResult {
  const { entries, situation, statementMonths, pendingReviewCount } = input
  const count = (pred: (code: string) => boolean) => entries.filter((e) => pred(e.categoryCode) && e.amount > 0).length
  const has = (...codes: string[]) => count((c) => codes.includes(c)) > 0
  const hasIncome = count((c) => getCategory(c).kind === 'income') > 0

  const missing: MissingItem[] = []
  const add = (key: MissingKey, override?: Partial<MissingItem>) => missing.push({ key, ...ITEMS[key], ...override })

  if (!hasIncome) add(statementMonths > 0 ? 'statements_without_income' : 'income')
  if (!has('logement', 'credit_immobilier')) add('housing')
  if (count((c) => getCategory(c).nature === 'fixed' && !['logement', 'credit_immobilier'].includes(c)) === 0) add('fixed_charges')
  if (!has('alimentation')) add('food')
  if (situation?.savingsAvailable == null) add('savings_available')
  if (situation?.debtRemaining == null) add('debt')
  if (situation?.mainGoal == null) add('goal')
  if (situation?.householdSize == null) add('household')
  if (statementMonths > 0 && statementMonths < 2.9) add('short_statement_period')
  if (pendingReviewCount > 0) add('pending_review')
  if ((input.unclassifiedAmount ?? 0) > 0) {
    add('unclassified', { impact: `${formatEuros(input.unclassifiedAmount!)} d’opérations « à vérifier » ne sont pas comptés tant que vous ne les avez pas classés.` })
  }
  if ((input.excludedImportCount ?? 0) > 0) add('excluded_import')

  const score = Math.max(0, 100 - missing.reduce((sum, i) => sum + i.weight, 0))
  const noIncome = missing.some((m) => m.key === 'income' || m.key === 'statements_without_income')
  const reliability: Reliability = noIncome || score < 60 ? 'low' : score < 85 ? 'medium' : 'high'

  const conclusions: Conclusion[] = [
    figureConclusion('Revenus mensuels', input.incomeSource ?? (hasIncome ? 'declared' : 'none'), statementMonths),
    figureConclusion('Dépenses mensuelles', input.expensesSource ?? (entries.length ? 'declared' : 'none'), statementMonths),
    situation?.debtRemaining != null || has('credit_immobilier', 'credits_consommation')
      ? { label: 'Endettement', level: situation?.debtRemaining != null ? 'fiable' : 'estime', reason: situation?.debtRemaining != null ? 'Dettes restantes déclarées' : 'Mensualités connues, capital restant non précisé' }
      : { label: 'Endettement', level: 'estime', reason: 'Aucun crédit identifié ni déclaré' },
    input.hasClosingBalance
      ? { label: 'Risque de découvert', level: 'estime', reason: 'Solde du dernier relevé moins les prélèvements récurrents attendus' }
      : { label: 'Risque de découvert', level: 'indisponible', reason: 'Nécessite un relevé indiquant le solde du compte' },
    (input.comparableMonths ?? 0) >= 2
      ? { label: 'Évolution des dépenses', level: 'fiable', reason: 'Mois comparés après normalisation sur un mois complet' }
      : { label: 'Évolution des dépenses', level: 'indisponible', reason: 'Nécessite au moins deux mois de relevés' },
  ]

  return { score, reliability, missing: missing.sort((a, b) => b.weight - a.weight), conclusions }
}
