// Diagnostic vert / orange / rouge.
//
// Chaque règle est explicite, s'appuie sur des seuils configurables
// (status.ts) et produit un constat compréhensible : explication, indicateur
// concret et action recommandée. L'IA peut commenter ces constats, elle ne
// décide jamais du statut.
//
// Le rouge est réservé aux risques sérieux : budget estimé négatif, charges
// essentielles non couvertes, retard de paiement déclaré, risque de découvert.
// Une forte consommation dans une catégorie n'est jamais rouge.

import type { BudgetSummary } from './budget'
import { findCategory } from './categories'
import type { FinancialSituation } from './completeness'
import type { GoalProgress } from './goals'
import { formatEuros, formatPercent, type Cents } from './money'
import type { PlannedVsActual } from './sources'
import { categoryTrends, type StatementFigures } from './statements'
import { thresholds, type FinancialStatus } from './status'

export type FindingLevel = 'rouge' | 'orange' | 'vert'

export type FindingCode =
  | 'negative_budget'
  | 'essential_not_covered'
  | 'payment_delays'
  | 'overdraft_risk'
  | 'no_income'
  | 'debt_ratio_high'
  | 'fixed_charges_high'
  | 'savings_below_target'
  | 'thin_margin'
  | 'budget_overrun'
  | 'charge_increase'
  | 'category_increase'
  | 'subscriptions_to_check'
  | 'bank_fees'
  | 'goal_at_risk'
  | 'under_control'

export interface Finding {
  code: FindingCode
  level: FindingLevel
  title: string
  explanation: string
  indicator: { label: string; value: string }
  action: { label: string; to: string }
}

export interface DiagnosisInput {
  summary: BudgetSummary
  figures: StatementFigures | null
  plannedVsActual: readonly PlannedVsActual[]
  situation: FinancialSituation | null
  goals: readonly GoalProgress[]
}

export interface Diagnosis {
  status: FinancialStatus
  /** Constat principal, toujours présent (explication, indicateur, action). */
  headline: Finding
  findings: Finding[]
}

const LEVEL_ORDER: Record<FindingLevel, number> = { rouge: 0, orange: 1, vert: 2 }
const STATUS_OF: Record<FindingLevel, FinancialStatus> = { rouge: 'prioritaire', orange: 'vigilance', vert: 'favorable' }
const eur = (c: Cents) => formatEuros(c)
const perMonth = (c: Cents) => `${formatEuros(c)} / mois`

export function diagnose({ summary, figures, plannedVsActual, situation, goals }: DiagnosisInput): Diagnosis {
  const t = thresholds()
  const f: Finding[] = []
  const { income, expenses, balance, savings, essentialExpenses, debtRatio, fixedChargesRatio, savingsRate } = summary

  // ----- Rouge -----------------------------------------------------------
  if (situation?.hasPaymentDelays) {
    f.push({
      code: 'payment_delays',
      level: 'rouge',
      title: 'Retard de paiement déclaré',
      explanation: 'Vous avez indiqué avoir des retards de paiement. Des pénalités ou frais peuvent s’ajouter rapidement.',
      indicator: { label: 'Retards en cours', value: 'Oui' },
      action: { label: 'Prioriser les charges essentielles et contacter vos créanciers pour un échéancier', to: '/app/budget?etape=situation' },
    })
  }

  if (income > 0 && essentialExpenses > income) {
    f.push({
      code: 'essential_not_covered',
      level: 'rouge',
      title: 'Charges essentielles non couvertes',
      explanation: 'Vos revenus ne suffisent pas à payer vos dépenses essentielles (logement, énergie, alimentation, santé, crédits…).',
      indicator: { label: 'Dépenses essentielles / revenus', value: `${eur(essentialExpenses)} pour ${eur(income)}` },
      action: { label: 'Vérifier vos droits aux aides et revoir les charges fixes les plus lourdes', to: '/app/budget?etape=charges' },
    })
  } else if (income > 0 && balance < 0) {
    f.push({
      code: 'negative_budget',
      level: 'rouge',
      title: 'Budget estimé négatif',
      explanation: 'Vos dépenses et votre épargne programmée dépassent vos revenus : chaque mois, il manque de l’argent.',
      indicator: { label: 'Reste budgétaire estimé', value: perMonth(balance) },
      action: { label: 'Réduire en priorité les dépenses réductibles', to: '/app/budget?etape=depenses' },
    })
  }

  const overdraft = figures?.accounts.filter((a) => a.availableAfterCommitments !== null && a.availableAfterCommitments < 0) ?? []
  if (overdraft.length) {
    const worst = overdraft.reduce((a, b) => (a.availableAfterCommitments! < b.availableAfterCommitments! ? a : b))
    f.push({
      code: 'overdraft_risk',
      level: 'rouge',
      title: 'Risque de découvert',
      explanation: `Après les prélèvements connus attendus avant votre prochain revenu, le compte « ${worst.accountKey} » passerait en négatif.`,
      indicator: { label: 'Solde après engagements', value: eur(worst.availableAfterCommitments!) },
      action: { label: 'Reporter une dépense non essentielle ou alimenter ce compte', to: '/app/releves' },
    })
  }

  // ----- Orange ----------------------------------------------------------
  if (income <= 0 && expenses > 0) {
    f.push({
      code: 'no_income',
      level: 'orange',
      title: 'Revenus non renseignés',
      explanation: 'Sans revenu connu, nous ne pouvons pas évaluer si vos dépenses sont couvertes.',
      indicator: { label: 'Revenus connus', value: eur(0) },
      action: { label: 'Ajouter vos revenus', to: '/app/budget?etape=revenus' },
    })
  }

  if (debtRatio !== null && debtRatio > t.debtRatioMax) {
    f.push({
      code: 'debt_ratio_high',
      level: 'orange',
      title: 'Endettement élevé',
      explanation: `Vos remboursements de crédits dépassent le seuil de référence de ${formatPercent(t.debtRatioMax)} de vos revenus.`,
      indicator: { label: 'Taux d’endettement', value: formatPercent(debtRatio, 1) },
      action: { label: 'Éviter tout nouveau crédit et étudier un regroupement ou une renégociation', to: '/app/budget?etape=charges' },
    })
  }

  if (fixedChargesRatio !== null && fixedChargesRatio > t.fixedChargesRatioWarning) {
    f.push({
      code: 'fixed_charges_high',
      level: 'orange',
      title: 'Budget rigide',
      explanation: 'Vos charges fixes absorbent une grande partie de vos revenus et laissent peu de marge de manœuvre.',
      indicator: { label: 'Part des charges fixes', value: formatPercent(fixedChargesRatio, 1) },
      action: { label: 'Comparer vos contrats d’énergie, d’assurance et de téléphone', to: '/app/budget?etape=charges' },
    })
  }

  if (income > 0 && balance >= 0 && savingsRate !== null && savingsRate < t.savingsRateTarget) {
    const thin = balance < income * t.safetyMarginRatio
    f.push({
      code: thin ? 'thin_margin' : 'savings_below_target',
      level: 'orange',
      title: thin ? 'Marge trop faible face aux imprévus' : 'Épargne inférieure à l’objectif',
      explanation: thin
        ? 'Votre budget est à l’équilibre, mais sans marge suffisante pour absorber une dépense imprévue.'
        : `Vous épargnez moins de ${formatPercent(t.savingsRateTarget)} de vos revenus.`,
      indicator: thin ? { label: 'Reste budgétaire estimé', value: perMonth(balance) } : { label: 'Taux d’épargne', value: formatPercent(savingsRate, 1) },
      action: thin
        ? { label: 'Dégager une marge en réduisant une dépense réductible', to: '/app/budget?etape=depenses' }
        : { label: 'Programmer un virement d’épargne en début de mois', to: '/app/budget?etape=charges' },
    })
  }

  const overruns = plannedVsActual
    .filter((p) => findCategory(p.categoryCode).kind === 'expense' && p.actual > p.planned * (1 + t.budgetOverrunRatio) && p.actual - p.planned >= t.categoryIncreaseMinAmount)
    .sort((a, b) => b.actual - b.planned - (a.actual - a.planned))
  if (overruns.length) {
    const top = overruns[0]
    f.push({
      code: 'budget_overrun',
      level: 'orange',
      title: overruns.length > 1 ? `${overruns.length} catégories dépassent leur budget` : 'Une catégorie dépasse son budget',
      explanation: `« ${findCategory(top.categoryCode).label} » : vos relevés montrent ${perMonth(top.actual)} alors que vous aviez prévu ${perMonth(top.planned)}.`,
      indicator: { label: 'Dépassement', value: `+${eur(top.actual - top.planned)} / mois` },
      action: { label: 'Vérifier les opérations de cette catégorie', to: '/app/releves' },
    })
  }

  const increases = (figures?.recurring ?? []).filter((r) => {
    const cat = findCategory(r.categoryCode)
    // Une « charge » : facture, crédit ou abonnement (pas un achat variable comme les courses).
    const isCharge = cat.nature === 'fixed' || cat.groupCode === 'abonnements'
    return r.direction < 0 && cat.kind === 'expense' && isCharge && r.previousAmount !== null && r.lastAmount > r.previousAmount * (1 + t.chargeIncreaseRatio)
  })
  if (increases.length) {
    const top = increases.sort((a, b) => b.lastAmount - b.previousAmount! - (a.lastAmount - a.previousAmount!))[0]
    f.push({
      code: 'charge_increase',
      level: 'orange',
      title: 'Une charge récurrente augmente',
      explanation: `Le prélèvement « ${top.merchantKey} » est passé de ${eur(top.previousAmount!)} à ${eur(top.lastAmount)}.`,
      indicator: { label: 'Hausse', value: `+${formatPercent((top.lastAmount - top.previousAmount!) / top.previousAmount!, 1)}` },
      action: { label: 'Vérifier la raison de la hausse auprès du prestataire', to: '/app/releves' },
    })
  }

  const rising = figures ? categoryTrends(figures.monthlyByCategory).filter((tr) => tr.ratio !== null && tr.ratio > t.categoryIncreaseRatio && tr.change >= t.categoryIncreaseMinAmount) : []
  if (rising.length) {
    const top = rising[0]
    f.push({
      code: 'category_increase',
      level: 'orange',
      title: 'Dépenses en hausse',
      explanation: `« ${findCategory(top.categoryCode).label} » augmente entre deux mois comparables (montants ramenés à un mois complet).`,
      indicator: { label: 'Variation', value: `${eur(top.previous.amount)} → ${eur(top.last.amount)}` },
      action: { label: 'Repérer les achats qui expliquent la hausse', to: '/app/releves' },
    })
  }

  const subscriptions = summary.byCategory.find((c) => c.categoryCode === 'abonnements')?.monthly ?? 0
  const recurringSubs = (figures?.recurring ?? []).filter((r) => r.categoryCode === 'abonnements' && r.direction < 0)
  if (income > 0 && (subscriptions > income * t.subscriptionsShareWarning || recurringSubs.length >= 4)) {
    f.push({
      code: 'subscriptions_to_check',
      level: 'orange',
      title: 'Abonnements à vérifier',
      explanation: 'Vos abonnements représentent une part notable de votre budget. Certains sont peut-être peu utilisés.',
      indicator: { label: 'Abonnements', value: recurringSubs.length ? `${perMonth(subscriptions)} · ${recurringSubs.length} prélèvements récurrents` : perMonth(subscriptions) },
      action: { label: 'Passer en revue vos abonnements et résilier ceux qui ne servent plus', to: '/app/releves' },
    })
  }

  const fees = summary.byCategory.find((c) => c.categoryCode === 'frais_bancaires')?.monthly ?? 0
  if (fees >= t.bankFeesMonthlyWarning) {
    f.push({
      code: 'bank_fees',
      level: 'orange',
      title: 'Frais bancaires élevés',
      explanation: 'Des frais bancaires réguliers ont été identifiés (cotisations, commissions, agios). Ils sont souvent évitables.',
      indicator: { label: 'Frais bancaires', value: perMonth(fees) },
      action: { label: 'Comparer votre offre bancaire et éviter les découverts', to: '/app/releves' },
    })
  }

  const atRisk = goals.filter((g) => !g.reached && g.daysLeft !== null && g.daysLeft <= t.goalDeadlineDays && g.onTrack === false)
  if (atRisk.length) {
    const g = atRisk[0]
    f.push({
      code: 'goal_at_risk',
      level: 'orange',
      title: 'Échéance d’objectif proche',
      explanation: `L’objectif « ${g.goal.name} » arrive à échéance et le rythme actuel ne suffit pas à l’atteindre.`,
      indicator: { label: 'Reste à épargner', value: `${eur(g.remaining)} en ${Math.max(0, g.daysLeft!)} jours` },
      action: { label: 'Ajuster le montant ou repousser l’échéance', to: '/app#objectifs' },
    })
  }

  f.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])

  const green: Finding = {
    code: 'under_control',
    level: 'vert',
    title: 'Budget maîtrisé',
    explanation: 'Vos revenus couvrent vos dépenses et votre épargne, et aucun risque n’a été détecté dans les données disponibles.',
    indicator: savingsRate !== null ? { label: 'Taux d’épargne', value: formatPercent(savingsRate, 1) } : { label: 'Reste budgétaire estimé', value: perMonth(balance) },
    action: savings > 0 ? { label: 'Fixer un objectif pour donner un but à votre épargne', to: '/app#objectifs' } : { label: 'Programmer une épargne mensuelle', to: '/app/budget?etape=charges' },
  }

  const headline = f[0] ?? green
  return { status: STATUS_OF[headline.level], headline, findings: f }
}

// ---------------------------------------------------------------------------
// Économies potentielles (jamais présentées comme réalisées)
// ---------------------------------------------------------------------------

export interface PotentialSaving {
  categoryCode: string
  current: Cents
  /** Économie mensuelle potentielle (hypothèse explicite). */
  potential: Cents
  hypothesis: string
}

export function potentialSavings(summary: BudgetSummary): PotentialSaving[] {
  const t = thresholds()
  return summary.byCategory
    .filter((c) => findCategory(c.categoryCode).nature === 'reducible' && c.monthly > 0)
    .map((c) => {
      const fees = c.categoryCode === 'frais_bancaires'
      const ratio = fees ? 0.5 : t.potentialSavingsRatio
      return {
        categoryCode: c.categoryCode,
        current: c.monthly,
        potential: Math.round(c.monthly * ratio),
        hypothesis: fees ? 'Hypothèse : moitié des frais évitée en changeant d’offre ou en évitant le découvert' : `Hypothèse : réduction de ${formatPercent(ratio)} de ce poste`,
      }
    })
    .sort((a, b) => b.potential - a.potential)
}
