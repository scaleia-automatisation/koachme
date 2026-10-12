// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Statuts de santé financière et seuils des règles métier.
// Les seuils sont configurables : la table diagnostic_rules (base de données)
// peut remplacer chacune des valeurs par défaut ci-dessous, sans redéploiement.

export type FinancialStatus = 'favorable' | 'vigilance' | 'prioritaire'

export const STATUS_META: Record<FinancialStatus, { label: string; color: 'vert' | 'orange' | 'rouge'; description: string }> = {
  favorable: {
    label: 'Situation maîtrisée',
    color: 'vert',
    description: 'Vos indicateurs sont cohérents avec votre budget et vos engagements connus semblent couverts.',
  },
  vigilance: {
    label: 'Point de vigilance',
    color: 'orange',
    description: 'Votre budget tient, mais un ou plusieurs points méritent votre attention.',
  },
  prioritaire: {
    label: 'Priorité d’action',
    color: 'rouge',
    description: 'Les données disponibles indiquent un risque sérieux qui demande une action rapide.',
  },
}

export interface Thresholds {
  /** Taux d'effort maximal recommandé pour les crédits (référence HCSF : 35 %). */
  debtRatioMax: number
  /** Part des charges fixes dans les revenus au-delà de laquelle le budget est rigide. */
  fixedChargesRatioWarning: number
  /** Taux d'épargne minimal visé. */
  savingsRateTarget: number
  /** Marge mensuelle minimale (part des revenus) pour absorber un imprévu. */
  safetyMarginRatio: number
  /** Dépassement toléré d'une catégorie par rapport au montant prévu par l'utilisateur. */
  budgetOverrunRatio: number
  /** Hausse d'une charge récurrente à partir de laquelle elle est signalée. */
  chargeIncreaseRatio: number
  /** Hausse mensuelle d'une catégorie (mois complets comparés) à partir de laquelle elle est signalée. */
  categoryIncreaseRatio: number
  /** Montant mensuel minimal pour signaler une hausse de catégorie (centimes). */
  categoryIncreaseMinAmount: number
  /** Part des revenus consacrée aux abonnements au-delà de laquelle ils sont à vérifier. */
  subscriptionsShareWarning: number
  /** Frais bancaires mensuels au-delà desquels ils sont signalés (centimes). */
  bankFeesMonthlyWarning: number
  /** Nombre de jours avant l'échéance d'un objectif à partir duquel un retard est signalé. */
  goalDeadlineDays: number
  /** Montant minimal d'une dépense ponctuelle pour être considérée exceptionnelle (centimes). */
  exceptionalExpenseMin: number
  /** Part des revenus réguliers à partir de laquelle une dépense ponctuelle est exceptionnelle. */
  exceptionalExpenseRatio: number
  /** Part des revenus réguliers à partir de laquelle un revenu ponctuel est exceptionnel. */
  exceptionalIncomeRatio: number
  /** Part des dépenses réductibles considérée comme économie potentielle réaliste. */
  potentialSavingsRatio: number
  /** Confiance minimale pour accepter la catégorie suggérée par l'IA sans confirmation. */
  aiMinConfidence: number
  /** Au-delà de ce montant (centimes), une catégorie proposée par l'IA est confirmée par l'utilisateur. */
  importantAmount: number
  /** Écart toléré entre deux montants d'une même opération récurrente. */
  recurringTolerance: number
  /** Écart maximal (jours) entre les deux jambes d'un virement entre comptes. */
  transferMatchDays: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  debtRatioMax: 0.35,
  fixedChargesRatioWarning: 0.6,
  savingsRateTarget: 0.1,
  safetyMarginRatio: 0.05,
  budgetOverrunRatio: 0.15,
  chargeIncreaseRatio: 0.05,
  categoryIncreaseRatio: 0.25,
  categoryIncreaseMinAmount: 3000,
  subscriptionsShareWarning: 0.05,
  bankFeesMonthlyWarning: 1000,
  goalDeadlineDays: 60,
  exceptionalExpenseMin: 30000,
  exceptionalExpenseRatio: 0.25,
  exceptionalIncomeRatio: 0.3,
  potentialSavingsRatio: 0.3,
  aiMinConfidence: 0.6,
  importantAmount: 30000,
  recurringTolerance: 0.2,
  transferMatchDays: 3,
}

let current: Thresholds = { ...DEFAULT_THRESHOLDS }

export function thresholds(): Thresholds {
  return current
}

/** Applique les seuils configurés en base (les clés inconnues ou invalides sont ignorées). */
export function setThresholds(overrides: Partial<Record<keyof Thresholds, number>>) {
  const next = { ...DEFAULT_THRESHOLDS }
  for (const [key, value] of Object.entries(overrides)) {
    if (key in next && typeof value === 'number' && Number.isFinite(value) && value >= 0) next[key as keyof Thresholds] = value
  }
  current = next
}

export function resetThresholds() {
  current = { ...DEFAULT_THRESHOLDS }
}
