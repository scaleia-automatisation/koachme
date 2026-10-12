import { describe, expect, it } from 'vitest'
import {
  analyzeTransactions,
  assessCompleteness,
  buildRecommendations,
  compareMonths,
  confirmedSavings,
  contributionSuggestions,
  diagnose,
  goalProgress,
  keyPoints,
  monthlyHistory,
  normalizeMonth,
  statementFigures,
  summarizeBudget,
  topPriorities,
  type BudgetEntry,
  type FinancialSituation,
  type ImportInfo,
  type RawTransaction,
  type RecommendationInput,
} from '@/domain'

let seq = 0
const tx = (p: Partial<RawTransaction> & Pick<RawTransaction, 'opDate' | 'label' | 'amount'>): RawTransaction => ({
  id: `t${++seq}`,
  importId: 'imp1',
  currency: 'EUR',
  isPending: false,
  aiCategoryCode: null,
  aiConfidence: null,
  userCategoryCode: null,
  userExcluded: null,
  userExceptional: null,
  reviewStatus: 'auto',
  ...p,
})
const IMPORTS: ImportInfo[] = [{ id: 'imp1', accountKey: 'courant', periodStart: '2026-01-01', periodEnd: '2026-02-14', closingBalance: null, createdAt: '2026-03-01' }]
const e = (categoryCode: string, euros: number): BudgetEntry => ({ categoryCode, amount: euros * 100, frequency: 'monthly' })

describe('corrections des données extraites', () => {
  it('appliquent le montant, la date et le libellé corrigés en conservant l’original', () => {
    const [a] = analyzeTransactions([tx({ opDate: '2026-01-10', label: 'CB XYZ 1O,OO', amount: -100, userAmount: -1000, userOpDate: '2026-01-11', userLabel: 'CB LIDL' })], IMPORTS, new Map())
    expect(a).toMatchObject({ amount: -1000, opDate: '2026-01-11', label: 'CB LIDL', categoryCode: 'alimentation' })
    expect(a.original).toEqual({ amount: -100, opDate: '2026-01-10', label: 'CB XYZ 1O,OO' })
  })
})

describe('historique mensuel', () => {
  const analyzed = analyzeTransactions(
    [
      tx({ opDate: '2026-01-28', label: 'VIR SALAIRE ACME', amount: 200000 }),
      tx({ opDate: '2026-01-05', label: 'CB LIDL', amount: -30000 }),
      tx({ opDate: '2026-01-06', label: 'COTISATION CARTE', amount: -1200 }),
      tx({ opDate: '2026-01-07', label: 'VIR VERS LIVRET A', amount: -20000 }),
      tx({ opDate: '2026-02-05', label: 'CB LIDL', amount: -20000 }),
      tx({ opDate: '2026-02-10', label: 'CB CARREFOUR', amount: -5000, isPending: true }),
    ],
    IMPORTS,
    new Map(),
  )
  const history = monthlyHistory(analyzed, IMPORTS)

  it('donne les chiffres constatés par mois, hors opérations en attente', () => {
    expect(history.map((m) => m.month)).toEqual(['2026-01', '2026-02'])
    expect(history[0]).toMatchObject({ coverage: 1, income: 200000, expenses: 31200, savings: 20000, fees: 1200, balance: 200000 - 31200 - 20000 })
    expect(history[1]).toMatchObject({ coverage: 0.5, expenses: 20000 })
  })

  it('ramène un mois partiel à un mois complet avant comparaison', () => {
    expect(normalizeMonth(history[1]).expenses).toBe(40000)
    const changes = compareMonths(history[0], history[1], 2000, 0.2)
    expect(changes).toEqual([{ categoryCode: 'alimentation', previous: 30000, current: 40000, change: 10000, ratio: 1 / 3 }])
  })
})

describe('objectifs', () => {
  const goal = { id: 'g', name: 'Vacances', targetAmount: 120000, savedAmount: 20000, contributionsTotal: 10000, monthlyContribution: 15000, targetDate: '2026-12-31' }

  it('additionne le montant de départ et les contributions confirmées', () => {
    const g = goalProgress(goal, 0, '2026-06-30')
    expect(g).toMatchObject({ current: 30000, remaining: 90000, progress: 0.25 })
  })

  it('estime le délai à partir de la contribution prévue, sinon de la capacité d’épargne', () => {
    expect(goalProgress(goal, 99999, '2026-06-30').estimate).toMatchObject({ months: 6, basis: 'contribution' })
    expect(goalProgress({ ...goal, monthlyContribution: null }, 30000, '2026-06-30').estimate).toMatchObject({ months: 3, basis: 'capacity' })
    expect(goalProgress({ ...goal, monthlyContribution: null }, 0, '2026-06-30').estimate).toBeNull()
  })

  it('ne suggère que des virements d’épargne non encore rattachés, sans jamais les affecter', () => {
    const analyzed = analyzeTransactions([tx({ id: 'sav1', opDate: '2026-01-07', label: 'VIR VERS LIVRET A', amount: -20000 }), tx({ id: 'sav2', opDate: '2026-02-07', label: 'VIR VERS LIVRET A', amount: -20000 }), tx({ opDate: '2026-02-08', label: 'VIR M DUPONT', amount: -5000 })], IMPORTS, new Map())
    expect(contributionSuggestions(analyzed, new Set(['sav1'])).map((t) => t.id)).toEqual(['sav2'])
  })
})

function input(entries: BudgetEntry[], extra: Partial<RecommendationInput> = {}, situation: FinancialSituation | null = null): RecommendationInput {
  const summary = summarizeBudget(entries)
  const diagnosis = diagnose({ summary, figures: null, plannedVsActual: [], situation, goals: [] })
  const completeness = assessCompleteness({ entries, situation, statementMonths: 0, pendingReviewCount: 0 })
  return { summary, figures: null, diagnosis, completeness, situation, goals: [], ...extra }
}

describe('recommandations', () => {
  it('chaque recommandation est complète et chiffrée à partir des données', () => {
    const recs = buildRecommendations(input([e('salaire', 2500), e('logement', 800), e('abonnements', 42), e('restaurants_livraisons', 180), e('frais_bancaires', 12)]))
    for (const r of recs) {
      expect(r.title && r.problem && r.action && r.cta.to).toBeTruthy()
      expect([1, 2, 3]).toContain(r.priority)
      expect(['facile', 'moyenne', 'difficile']).toContain(r.difficulty)
    }
    const subs = recs.find((r) => r.key === 'recurring:subscriptions')!
    expect(subs.problem).toMatch(/42/)
    expect(subs.potentialHypothesis).toMatch(/théorique/)
  })

  it('présente au plus trois priorités, l’urgence d’abord', () => {
    const situation: FinancialSituation = { savingsAvailable: 0, debtRemaining: null, hasPaymentDelays: true, mainGoal: null, householdSize: null }
    const recs = buildRecommendations(input([e('salaire', 2000), e('logement', 800), e('abonnements', 60), e('frais_bancaires', 15), e('shopping', 200)], {}, situation))
    const top = topPriorities(recs)
    expect(top).toHaveLength(3)
    expect(top[0]).toMatchObject({ key: 'prevention:payment_delays', priority: 1 })
    expect(top[1].priority).toBe(2)
  })

  it('exclut des priorités les actions réalisées ou non pertinentes', () => {
    const actions = new Map([
      ['recurring:subscriptions', { status: 'dismissed' as const, confirmedSaving: null }],
      ['recurring:bank_fees', { status: 'done' as const, confirmedSaving: 600 }],
    ])
    const recs = buildRecommendations(input([e('salaire', 2500), e('abonnements', 42), e('frais_bancaires', 12), e('restaurants_livraisons', 180)], { actions }))
    expect(topPriorities(recs).map((r) => r.key)).not.toContain('recurring:subscriptions')
    expect(topPriorities(recs).map((r) => r.key)).not.toContain('recurring:bank_fees')
  })

  it('ne compte une économie comme réelle que si l’utilisateur l’a confirmée', () => {
    const actions = new Map([
      ['recurring:subscriptions', { status: 'in_progress' as const, confirmedSaving: null }],
      ['recurring:bank_fees', { status: 'done' as const, confirmedSaving: 600 }],
      ['improve:reduce:restaurants_livraisons', { status: 'done' as const, confirmedSaving: null }],
    ])
    const recs = buildRecommendations(input([e('salaire', 2500), e('abonnements', 42), e('frais_bancaires', 12), e('restaurants_livraisons', 180)], { actions }))
    expect(confirmedSavings(recs)).toBe(600)
  })

  it('ne signale pas un seul petit abonnement', () => {
    expect(buildRecommendations(input([e('salaire', 2500), e('abonnements', 13.49)])).some((r) => r.key === 'recurring:subscriptions')).toBe(false)
  })

  it('ne propose pas de résilier un abonnement jugé utile', () => {
    const analyzed = analyzeTransactions(
      [
        tx({ opDate: '2026-01-10', label: 'PRLV NETFLIX', amount: -1349 }),
        tx({ opDate: '2026-02-10', label: 'PRLV NETFLIX', amount: -1349 }),
        tx({ opDate: '2026-01-12', label: 'PRLV SPOTIFY', amount: -1099 }),
        tx({ opDate: '2026-02-12', label: 'PRLV SPOTIFY', amount: -1099 }),
      ],
      [{ ...IMPORTS[0], periodEnd: '2026-02-28' }],
      new Map(),
    )
    const figures = statementFigures(analyzed, [{ ...IMPORTS[0], periodEnd: '2026-02-28' }])
    const base = input([e('salaire', 2500), e('abonnements', 13.49)], { figures })
    expect(buildRecommendations(base).some((r) => r.key === 'recurring:subscriptions')).toBe(true)
    expect(buildRecommendations({ ...base, subscriptionVerdicts: new Map([['NETFLIX', 'useful'], ['SPOTIFY', 'useful']]) }).some((r) => r.key === 'recurring:subscriptions')).toBe(false)
  })

  it('n’emploie jamais le mot « gaspillage »', () => {
    const recs = buildRecommendations(input([e('salaire', 2000), e('abonnements', 60), e('frais_bancaires', 15), e('shopping', 200), e('restaurants_livraisons', 300)]))
    expect(JSON.stringify(recs)).not.toMatch(/gaspill/i)
  })
})

describe('points à retenir', () => {
  it('résume la situation en trois faits au plus', () => {
    const summary = summarizeBudget([e('salaire', 2500), e('logement', 900), e('alimentation', 400), e('epargne', 100)])
    const points = keyPoints(summary, null, diagnose({ summary, figures: null, plannedVsActual: [], situation: null, goals: [] }))
    expect(points.length).toBeLessThanOrEqual(3)
    expect(points[0]).toMatchObject({ tone: 'positive' })
    expect(points[1].text).toMatch(/Logement/)
  })
})
