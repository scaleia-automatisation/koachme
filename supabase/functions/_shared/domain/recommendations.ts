// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Moteur de recommandations personnalisées, entièrement déterministe.
//
// Chaque recommandation repose sur des chiffres calculés par le moteur
// (jamais par l'IA) et comporte : titre, problème, données justificatives,
// action, économie potentielle (théorique, si calculable), priorité,
// difficulté et action de suivi.
//
// Trois priorités au maximum sont présentées, dans cet ordre :
//   1. prévenir un problème financier urgent ;
//   2. réduire une dépense récurrente évitable ;
//   3. améliorer progressivement l'épargne ou le budget.
//
// Une économie n'est jamais comptée comme réelle parce qu'une recommandation
// a été consultée ou acceptée : seule l'économie confirmée par l'utilisateur
// (action « réalisée » + montant déclaré) est additionnée.

import type { BudgetSummary } from './budget.ts'
import { findCategory } from './categories.ts'
import type { CompletenessResult, FinancialSituation } from './completeness.ts'
import type { Diagnosis } from './diagnosis.ts'
import type { GoalProgress } from './goals.ts'
import { formatEuros, formatPercent, type Cents } from './money.ts'
import type { StatementFigures } from './statements.ts'
import { thresholds } from './status.ts'

export type RecommendationPriority = 1 | 2 | 3
export type Difficulty = 'facile' | 'moyenne' | 'difficile'
export type ActionStatus = 'todo' | 'in_progress' | 'done' | 'dismissed'
export type SubscriptionVerdict = 'useful' | 'to_cancel' | 'cancelled'

export const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  1: 'Urgent',
  2: 'Dépense récurrente',
  3: 'Amélioration',
}

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Réalisée',
  dismissed: 'Non pertinente',
}

export interface Recommendation {
  /** Identifiant stable, pour suivre le statut d'une analyse à l'autre. */
  key: string
  title: string
  problem: string
  evidence: string[]
  action: string
  /** Économie mensuelle potentielle (théorique), si calculable. */
  potentialMonthly: Cents | null
  potentialHypothesis: string | null
  priority: RecommendationPriority
  difficulty: Difficulty
  cta: { label: string; to: string }
  status: ActionStatus
  confirmedSaving: Cents | null
}

export interface RecommendationInput {
  summary: BudgetSummary
  figures: StatementFigures | null
  diagnosis: Diagnosis
  completeness: CompletenessResult
  situation: FinancialSituation | null
  goals: readonly GoalProgress[]
  subscriptionVerdicts?: ReadonlyMap<string, SubscriptionVerdict>
  actions?: ReadonlyMap<string, { status: ActionStatus; confirmedSaving: Cents | null }>
}

const eur = (c: Cents) => formatEuros(c)
const perMonth = (c: Cents) => `${formatEuros(c)} par mois`
const DIFFICULTY_ORDER: Record<Difficulty, number> = { facile: 0, moyenne: 1, difficile: 2 }

type Draft = Omit<Recommendation, 'status' | 'confirmedSaving'>

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const t = thresholds()
  const { summary, figures, diagnosis, situation, goals, completeness } = input
  const verdicts = input.subscriptionVerdicts ?? new Map()
  const drafts: Draft[] = []
  const monthly = (code: string) => summary.byCategory.find((c) => c.categoryCode === code)?.monthly ?? 0

  // ----- 1. Prévention des problèmes urgents -------------------------------
  for (const f of diagnosis.findings.filter((x) => x.level === 'rouge')) {
    const common = { priority: 1 as const, potentialMonthly: null, potentialHypothesis: null, evidence: [`${f.indicator.label} : ${f.indicator.value}`] }
    switch (f.code) {
      case 'negative_budget':
        drafts.push({
          ...common,
          key: 'prevention:negative_budget',
          title: 'Rééquilibrer votre budget mensuel',
          problem: f.explanation,
          action: `Réduisez en priorité vos dépenses réductibles (${eur(summary.expensesByNature.reducible)} par mois aujourd’hui) jusqu’à revenir à un reste positif.`,
          difficulty: 'moyenne',
          cta: { label: 'Voir mes dépenses', to: '/app/depenses' },
        })
        break
      case 'essential_not_covered':
        drafts.push({
          ...common,
          key: 'prevention:essential_not_covered',
          title: 'Sécuriser vos charges essentielles',
          problem: f.explanation,
          action: 'Vérifiez vos droits aux aides (CAF, prime d’activité, chèque énergie) et contactez vos créanciers avant tout incident de paiement.',
          difficulty: 'difficile',
          cta: { label: 'Compléter mes revenus', to: '/app/budget?etape=revenus' },
        })
        break
      case 'payment_delays':
        drafts.push({
          ...common,
          key: 'prevention:payment_delays',
          title: 'Régulariser vos retards de paiement',
          problem: f.explanation,
          action: 'Listez vos retards, payez en premier le logement et l’énergie, puis demandez un échéancier écrit pour le reste.',
          difficulty: 'moyenne',
          cta: { label: 'Mettre à jour ma situation', to: '/app/budget?etape=situation' },
        })
        break
      case 'overdraft_risk':
        drafts.push({
          ...common,
          key: 'prevention:overdraft_risk',
          title: 'Éviter un découvert avant votre prochain revenu',
          problem: f.explanation,
          action: 'Reportez les dépenses non essentielles jusqu’à votre prochain revenu, ou transférez de l’épargne vers ce compte.',
          difficulty: 'facile',
          cta: { label: 'Voir mes relevés', to: '/app/releves' },
        })
        break
    }
  }

  if (summary.debtRatio !== null && summary.debtRatio > t.debtRatioMax) {
    drafts.push({
      key: 'debt:ratio',
      title: 'Alléger vos remboursements de crédits',
      problem: `Vos crédits représentent ${formatPercent(summary.debtRatio, 1)} de vos revenus, au-delà du seuil de référence de ${formatPercent(t.debtRatioMax)}.`,
      evidence: [`Mensualités : ${perMonth(summary.debtRepayments)}`, ...(situation?.debtRemaining ? [`Capital restant déclaré : ${eur(situation.debtRemaining)}`] : [])],
      action: 'N’ouvrez pas de nouveau crédit ; remboursez d’abord le crédit au taux le plus élevé et renseignez-vous sur un regroupement ou une renégociation.',
      potentialMonthly: null,
      potentialHypothesis: null,
      priority: 1,
      difficulty: 'difficile',
      cta: { label: 'Voir mes charges', to: '/app/budget?etape=charges' },
    })
  }

  // ----- 2. Dépenses récurrentes évitables ---------------------------------
  const subs = (figures?.recurring ?? []).filter((r) => r.direction < 0 && findCategory(r.categoryCode).groupCode === 'abonnements' && verdicts.get(r.merchantKey) !== 'useful')
  const subsTotal = subs.reduce((s, r) => s + r.typicalAmount, 0)
  const declaredSubs = figures?.recurring.length ? 0 : monthly('abonnements')
  // Seuil de pertinence : un seul petit abonnement ne justifie pas une priorité.
  if (subsTotal >= 2000 || subs.length >= 2 || declaredSubs >= 2000) {
    const toCancel = subs.filter((r) => verdicts.get(r.merchantKey) === 'to_cancel').reduce((s, r) => s + r.typicalAmount, 0)
    const total = subsTotal || declaredSubs
    const theoretical = toCancel || Math.round(total * t.potentialSavingsRatio)
    drafts.push({
      key: 'recurring:subscriptions',
      title: 'Faire le point sur vos abonnements',
      problem: subsTotal
        ? `Vos abonnements identifiés représentent ${perMonth(subsTotal)} (${subs.length} paiement${subs.length > 1 ? 's' : ''} récurrent${subs.length > 1 ? 's' : ''}).`
        : `Vos abonnements déclarés représentent ${perMonth(declaredSubs)}.`,
      evidence: subs.slice(0, 5).map((r) => `${r.merchantKey} : ${eur(r.typicalAmount)} vers le ${r.typicalDay} du mois`),
      action: 'Vérifiez lesquels sont encore utiles et indiquez-le pour chacun ; résiliez ceux qui ne servent plus.',
      potentialMonthly: theoretical,
      potentialHypothesis: toCancel
        ? `Abonnements que vous avez marqués « à résilier » : ${eur(toCancel * 12)} par an.`
        : `Si vous en résiliez pour ${eur(theoretical)} par mois, votre économie théorique serait de ${eur(theoretical * 12)} par an.`,
      priority: 2,
      difficulty: 'facile',
      cta: { label: 'Vérifier mes abonnements', to: '/app/depenses#recurrents' },
    })
  }

  const fees = monthly('frais_bancaires')
  if (fees > 0 && fees >= t.bankFeesMonthlyWarning / 2) {
    drafts.push({
      key: 'recurring:bank_fees',
      title: 'Réduire vos frais bancaires',
      problem: `Des frais bancaires ont été identifiés : ${perMonth(fees)}.`,
      evidence: [`Frais bancaires : ${eur(fees * 12)} par an au rythme actuel`],
      action: 'Comparez votre offre bancaire (cotisation de carte, tenue de compte) et évitez les commissions d’intervention liées au découvert.',
      potentialMonthly: Math.round(fees / 2),
      potentialHypothesis: `Si la moitié de ces frais était évitée, l’économie théorique serait de ${eur(Math.round(fees / 2) * 12)} par an.`,
      priority: 2,
      difficulty: 'facile',
      cta: { label: 'Voir les frais', to: '/app/depenses?categorie=frais_bancaires' },
    })
  }

  const contracts = ['energie_eau', 'assurances', 'telecom'].map((code) => ({ code, amount: monthly(code) })).filter((c) => c.amount > 0)
  const contractsTotal = contracts.reduce((s, c) => s + c.amount, 0)
  if (contractsTotal >= 8000) {
    const potential = Math.round(contractsTotal * 0.1)
    drafts.push({
      key: 'recurring:contracts',
      title: 'Comparer vos contrats d’énergie, d’assurance et de téléphone',
      problem: `Ces contrats représentent ${perMonth(contractsTotal)}.`,
      evidence: contracts.map((c) => `${findCategory(c.code).label} : ${perMonth(c.amount)}`),
      action: 'Comparez ces contrats une fois par an : à garanties égales, les écarts de prix entre fournisseurs sont fréquents.',
      potentialMonthly: potential,
      potentialHypothesis: `Hypothèse : 10 % de baisse après comparaison, soit ${eur(potential * 12)} par an.`,
      priority: 2,
      difficulty: 'moyenne',
      cta: { label: 'Voir mes charges fixes', to: '/app/depenses?nature=fixed' },
    })
  }

  for (const f of diagnosis.findings.filter((x) => x.code === 'charge_increase')) {
    drafts.push({
      key: 'recurring:charge_increase',
      title: 'Vérifier une charge en hausse',
      problem: f.explanation,
      evidence: [`${f.indicator.label} : ${f.indicator.value}`],
      action: 'Contactez le prestataire pour comprendre la hausse et, si elle n’est pas justifiée, faites jouer la concurrence.',
      potentialMonthly: null,
      potentialHypothesis: null,
      priority: 2,
      difficulty: 'facile',
      cta: { label: 'Voir les paiements récurrents', to: '/app/depenses#recurrents' },
    })
  }

  // ----- 3. Amélioration progressive ---------------------------------------
  const reducible = summary.byCategory
    .filter((c) => findCategory(c.categoryCode).nature === 'reducible' && !['abonnements', 'frais_bancaires'].includes(c.categoryCode) && c.monthly >= 3000)
    .sort((a, b) => b.monthly - a.monthly)[0]
  if (reducible) {
    const potential = Math.round(reducible.monthly * t.potentialSavingsRatio)
    const label = findCategory(reducible.categoryCode).label
    drafts.push({
      key: `improve:reduce:${reducible.categoryCode}`,
      title: `Fixer un plafond pour « ${label} »`,
      problem: `Ce poste représente ${perMonth(reducible.monthly)}.`,
      evidence: [`${label} : ${perMonth(reducible.monthly)}`],
      action: `Fixez-vous un plafond mensuel (par exemple ${eur(reducible.monthly - potential)}) et suivez-le chaque mois dans « Mes dépenses ».`,
      potentialMonthly: potential,
      potentialHypothesis: `Hypothèse : ${formatPercent(t.potentialSavingsRatio)} de baisse, soit ${eur(potential * 12)} par an.`,
      priority: 3,
      difficulty: 'moyenne',
      cta: { label: 'Voir le détail', to: `/app/depenses?categorie=${reducible.categoryCode}` },
    })
  }

  if (summary.income > 0 && summary.balance > 0 && summary.savingsRate !== null && summary.savingsRate < t.savingsRateTarget) {
    const gap = Math.ceil(summary.income * t.savingsRateTarget - summary.savings)
    const amount = Math.max(1000, Math.min(gap, Math.round(summary.balance / 2)))
    drafts.push({
      key: 'improve:savings_transfer',
      title: 'Programmer une épargne automatique',
      problem: `Vous épargnez ${formatPercent(summary.savingsRate, 1)} de vos revenus, pour un objectif de ${formatPercent(t.savingsRateTarget)}.`,
      evidence: [`Reste budgétaire estimé : ${perMonth(summary.balance)}`, `Épargne actuelle : ${perMonth(summary.savings)}`],
      action: `Programmez un virement automatique de ${eur(amount)} vers votre épargne le jour de votre revenu.`,
      potentialMonthly: null,
      potentialHypothesis: null,
      priority: 3,
      difficulty: 'facile',
      cta: { label: 'Créer un objectif', to: '/app/objectifs' },
    })
  }

  if (situation?.savingsAvailable != null && summary.essentialExpenses > 0) {
    const target = summary.essentialExpenses * 3
    if (situation.savingsAvailable < target) {
      drafts.push({
        key: 'improve:emergency_fund',
        title: 'Constituer une épargne de précaution',
        problem: `Votre épargne disponible (${eur(situation.savingsAvailable)}) couvre moins de 3 mois de dépenses essentielles.`,
        evidence: [`Dépenses essentielles : ${perMonth(summary.essentialExpenses)}`, `Repère : 3 mois, soit ${eur(target)}`],
        action: 'Créez un objectif « Épargne de précaution » et alimentez-le chaque mois, même modestement.',
        potentialMonthly: null,
        potentialHypothesis: null,
        priority: 3,
        difficulty: 'moyenne',
        cta: { label: 'Créer l’objectif', to: '/app/objectifs?nouveau=emergency_fund' },
      })
    }
  }

  for (const g of goals.filter((x) => !x.reached && x.onTrack === false && x.daysLeft !== null && x.daysLeft > 0)) {
    drafts.push({
      key: `improve:goal:${g.goal.id}`,
      title: `Ajuster l’objectif « ${g.goal.name} »`,
      problem: `Il reste ${eur(g.remaining)} à réunir et le rythme actuel ne suffit pas pour l’échéance.`,
      evidence: g.requiredMonthly ? [`Effort nécessaire : ${perMonth(g.requiredMonthly)}`] : [],
      action: 'Augmentez la contribution mensuelle ou repoussez l’échéance pour garder un objectif atteignable.',
      potentialMonthly: null,
      potentialHypothesis: null,
      priority: 3,
      difficulty: 'facile',
      cta: { label: 'Voir mes objectifs', to: '/app/objectifs' },
    })
  }

  const unclassified = completeness.missing.find((m) => m.key === 'unclassified' || m.key === 'pending_review')
  if (unclassified) {
    drafts.push({
      key: 'improve:classify',
      title: 'Classer vos opérations à vérifier',
      problem: unclassified.impact,
      evidence: [unclassified.label],
      action: 'Confirmez ou corrigez ces opérations : votre bilan sera plus juste.',
      potentialMonthly: null,
      potentialHypothesis: null,
      priority: 3,
      difficulty: 'facile',
      cta: { label: 'Vérifier mes relevés', to: '/app/releves' },
    })
  }

  const actions = input.actions ?? new Map()
  return drafts
    .map((d) => ({ ...d, status: actions.get(d.key)?.status ?? 'todo', confirmedSaving: actions.get(d.key)?.confirmedSaving ?? null }))
    .sort((a, b) => a.priority - b.priority || (b.potentialMonthly ?? 0) - (a.potentialMonthly ?? 0) || DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
}

/** Les trois actions les plus utiles, hors actions réalisées ou jugées non pertinentes. */
export function topPriorities(recommendations: readonly Recommendation[], max = 3): Recommendation[] {
  return recommendations.filter((r) => r.status !== 'done' && r.status !== 'dismissed').slice(0, max)
}

/** Économies réellement confirmées par l'utilisateur (mensuelles). */
export function confirmedSavings(recommendations: readonly Recommendation[]): Cents {
  return recommendations.filter((r) => r.status === 'done' && r.confirmedSaving).reduce((s, r) => s + r.confirmedSaving!, 0)
}

// ---------------------------------------------------------------------------
// Trois points à retenir
// ---------------------------------------------------------------------------

export interface KeyPoint {
  text: string
  tone: 'positive' | 'neutral' | 'warning' | 'negative'
}

export function keyPoints(summary: BudgetSummary, figures: StatementFigures | null, diagnosis: Diagnosis): KeyPoint[] {
  const points: KeyPoint[] = []
  if (summary.income > 0) {
    points.push(
      summary.balance >= 0
        ? { text: `Vos revenus couvrent vos dépenses et votre épargne, avec un reste estimé de ${perMonth(summary.balance)}.`, tone: 'positive' }
        : { text: `Il manque environ ${perMonth(-summary.balance)} pour couvrir vos dépenses et votre épargne.`, tone: 'negative' },
    )
  } else {
    points.push({ text: 'Aucun revenu n’est encore renseigné : le bilan reste partiel.', tone: 'warning' })
  }

  const groups = new Map<string, number>()
  for (const c of summary.byCategory) {
    const cat = findCategory(c.categoryCode)
    if (cat.kind === 'expense') groups.set(cat.groupCode, (groups.get(cat.groupCode) ?? 0) + c.monthly)
  }
  const top = [...groups.entries()].sort((a, b) => b[1] - a[1])[0]
  const gross = summary.expensesByNature.fixed + summary.expensesByNature.variable + summary.expensesByNature.reducible
  if (top && gross > 0) {
    const label = findCategory(summary.byCategory.find((c) => findCategory(c.categoryCode).groupCode === top[0])!.categoryCode).label
    points.push({ text: `Votre premier poste de dépense est « ${label} » : ${formatPercent(top[1] / gross)} de vos dépenses.`, tone: 'neutral' })
  }

  const recurringOut = (figures?.recurring ?? []).filter((r) => r.direction < 0)
  const secondary = diagnosis.findings.find((f) => f !== diagnosis.headline && f.level !== 'vert')
  if (secondary) points.push({ text: `${secondary.title} — ${secondary.indicator.label.toLowerCase()} : ${secondary.indicator.value}.`, tone: secondary.level === 'rouge' ? 'negative' : 'warning' })
  else if (recurringOut.length) points.push({ text: `${recurringOut.length} paiements reviennent chaque mois, pour environ ${perMonth(recurringOut.reduce((s, r) => s + r.typicalAmount, 0))}.`, tone: 'neutral' })
  else if (summary.savingsRate !== null) points.push({ text: `Votre taux d’épargne est de ${formatPercent(summary.savingsRate, 1)}.`, tone: summary.savingsRate >= thresholds().savingsRateTarget ? 'positive' : 'warning' })

  return points.slice(0, 3)
}
