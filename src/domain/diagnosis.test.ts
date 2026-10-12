import { describe, expect, it } from 'vitest'
import {
  assessCompleteness,
  diagnose,
  goalProgress,
  mergeBudgetSources,
  potentialSavings,
  summarizeBudget,
  type BudgetEntry,
  type DeclaredEntry,
  type DiagnosisInput,
  type FinancialSituation,
  type StatementFigures,
} from '@/domain'

const e = (categoryCode: string, euros: number, frequency: BudgetEntry['frequency'] = 'monthly'): BudgetEntry => ({ categoryCode, amount: euros * 100, frequency })
const run = (entries: BudgetEntry[], extra: Partial<DiagnosisInput> = {}) =>
  diagnose({ summary: summarizeBudget(entries), figures: null, plannedVsActual: [], situation: null, goals: [], ...extra })
const codes = (d: ReturnType<typeof diagnose>) => d.findings.map((f) => f.code)

const emptyFigures = (over: Partial<StatementFigures> = {}): StatementFigures => ({
  entries: [],
  monthsByAccount: {},
  period: null,
  exceptionalIncome: [],
  exceptionalExpenses: [],
  toConfirm: { count: 0, credits: 0, debits: 0 },
  pending: { count: 0, total: 0 },
  transfers: { count: 0, total: 0 },
  recurring: [],
  accounts: [],
  monthlyByCategory: new Map(),
  ...over,
})

describe('diagnostic', () => {
  it('vert : situation maîtrisée, avec explication, indicateur et action', () => {
    const d = run([e('salaire', 3000), e('logement', 900), e('alimentation', 400), e('epargne', 400)])
    expect(d.status).toBe('favorable')
    expect(d.headline).toMatchObject({ level: 'vert', code: 'under_control' })
    expect(d.headline.indicator.value).toMatch(/13,3/)
    expect(d.headline.action.label).toBeTruthy()
  })

  it('rouge : budget estimé négatif', () => {
    const d = run([e('salaire', 1500), e('logement', 800), e('shopping', 900)])
    expect(d.status).toBe('prioritaire')
    expect(d.headline.code).toBe('negative_budget')
  })

  it('rouge : charges essentielles non couvertes', () => {
    expect(run([e('salaire', 1000), e('logement', 800), e('alimentation', 400)]).headline.code).toBe('essential_not_covered')
  })

  it('rouge : retard de paiement déclaré', () => {
    const situation: FinancialSituation = { savingsAvailable: null, debtRemaining: null, hasPaymentDelays: true, mainGoal: null, householdSize: null }
    expect(run([e('salaire', 3000), e('epargne', 400)], { situation }).headline.code).toBe('payment_delays')
  })

  it('rouge : risque de découvert après engagements', () => {
    const figures = emptyFigures({
      accounts: [{ accountKey: 'Compte ••1234', periodStart: '2026-01-01', periodEnd: '2026-01-31', months: 1, netFlow: 0, closingBalance: 20000, upcomingCommitments: 35000, availableAfterCommitments: -15000, pendingTotal: 0 }],
    })
    const d = run([e('salaire', 3000), e('epargne', 400)], { figures })
    expect(d.headline).toMatchObject({ code: 'overdraft_risk', level: 'rouge' })
    expect(d.headline.indicator.value).toMatch(/-150/)
  })

  it('jamais rouge parce qu’une catégorie est forte : seulement orange', () => {
    const d = run([e('salaire', 3000), e('restaurants_livraisons', 1200), e('epargne', 400)])
    expect(d.findings.every((f) => f.level !== 'rouge')).toBe(true)
  })

  it('orange : endettement au-delà de 35 %, charges fixes lourdes, épargne faible', () => {
    expect(codes(run([e('salaire', 2000), e('credit_immobilier', 750), e('epargne', 300)]))).toContain('debt_ratio_high')
    expect(codes(run([e('salaire', 2000), e('logement', 1300), e('epargne', 300)]))).toContain('fixed_charges_high')
    expect(codes(run([e('salaire', 2000), e('logement', 700), e('alimentation', 500), e('epargne', 100)]))).toContain('savings_below_target')
  })

  it('orange : catégorie qui dépasse le budget prévu', () => {
    const d = run([e('salaire', 3000), e('alimentation', 550), e('epargne', 400)], { plannedVsActual: [{ categoryCode: 'alimentation', planned: 40000, actual: 55000 }] })
    expect(d.findings.find((f) => f.code === 'budget_overrun')).toMatchObject({ level: 'orange' })
  })

  it('orange : charge récurrente en hausse et abonnements nombreux', () => {
    const rec = (merchantKey: string, categoryCode: string, lastAmount: number, previousAmount: number) => ({ merchantKey, label: merchantKey, categoryCode, direction: -1 as const, typicalAmount: lastAmount, occurrences: 2, typicalDay: 5, lastAmount, previousAmount })
    const figures = emptyFigures({ recurring: [rec('EDF', 'energie_eau', 9000, 7000), rec('NETFLIX', 'abonnements', 1300, 1300), rec('SPOTIFY', 'abonnements', 1100, 1100), rec('DISNEY', 'abonnements', 900, 900), rec('ICLOUD', 'abonnements', 300, 300)] })
    const c = codes(run([e('salaire', 3000), e('epargne', 400)], { figures }))
    expect(c).toContain('charge_increase')
    expect(c).toContain('subscriptions_to_check')
  })

  it('une hausse de courses n’est pas une « charge qui augmente »', () => {
    const figures = emptyFigures({ recurring: [{ merchantKey: 'LIDL', label: 'LIDL', categoryCode: 'alimentation', direction: -1, typicalAmount: 6000, occurrences: 2, typicalDay: 13, lastAmount: 6130, previousAmount: 5420 }] })
    expect(codes(run([e('salaire', 3000), e('epargne', 400)], { figures }))).not.toContain('charge_increase')
  })

  it('orange : frais bancaires élevés', () => {
    expect(codes(run([e('salaire', 3000), e('frais_bancaires', 25), e('epargne', 400)]))).toContain('bank_fees')
  })

  it('orange sans revenu connu, jamais rouge par manque de données', () => {
    const d = run([e('logement', 800)])
    expect(d.headline).toMatchObject({ code: 'no_income', level: 'orange' })
  })

  it('trie les constats du plus grave au moins grave', () => {
    const situation: FinancialSituation = { savingsAvailable: null, debtRemaining: null, hasPaymentDelays: true, mainGoal: null, householdSize: null }
    const d = run([e('salaire', 2000), e('credit_immobilier', 800)], { situation })
    expect(d.findings[0].level).toBe('rouge')
    expect(d.findings.at(-1)!.level).toBe('orange')
  })
})

describe('économies potentielles', () => {
  it('sont calculées sur les dépenses réductibles avec une hypothèse explicite', () => {
    const p = potentialSavings(summarizeBudget([e('salaire', 2000), e('restaurants_livraisons', 200), e('logement', 800), e('frais_bancaires', 20)]))
    expect(p.map((x) => [x.categoryCode, x.potential])).toEqual([
      ['restaurants_livraisons', 6000],
      ['frais_bancaires', 1000],
    ])
    expect(p[0].hypothesis).toMatch(/Hypothèse/)
  })
})

describe('objectifs', () => {
  const goal = { id: 'g', name: 'Vacances', targetAmount: 120000, savedAmount: 30000, targetDate: '2026-12-31' }
  it('calcule le reste, l’avancement et l’effort mensuel', () => {
    const g = goalProgress(goal, 20000, '2026-06-30')
    expect(g).toMatchObject({ reached: false, remaining: 90000, progress: 0.25 })
    expect(g.requiredMonthly).toBe(Math.ceil(90000 / (184 / (365.25 / 12))))
    expect(g.onTrack).toBe(true)
    expect(goalProgress(goal, 5000, '2026-06-30').onTrack).toBe(false)
  })
  it('reconnaît un objectif atteint', () => {
    expect(goalProgress({ ...goal, savedAmount: 130000 }, 0, '2026-06-30')).toMatchObject({ reached: true, remaining: 0, progress: 1 })
  })
})

describe('fusion des sources', () => {
  const declared: DeclaredEntry[] = [
    { id: 'm1', categoryCode: 'alimentation', label: null, amount: 40000, frequency: 'monthly', source: 'manual' },
    { id: 'm2', categoryCode: 'logement', label: null, amount: 80000, frequency: 'monthly', source: 'manual' },
    { id: 'o1', categoryCode: 'revenus_locatifs', label: 'Loyer perçu en espèces', amount: 30000, frequency: 'monthly', source: 'off_statement' },
  ]

  it('sans relevé, compte toutes les lignes déclarées', () => {
    const r = mergeBudgetSources(declared, [])
    expect(r.entries).toHaveLength(3)
    expect(r).toMatchObject({ incomeSource: 'declared', expensesSource: 'declared', replacedEntryIds: [] })
  })

  it('les relevés remplacent les lignes manuelles couvertes, qui deviennent le budget prévu', () => {
    const r = mergeBudgetSources(declared, [e('alimentation', 550), e('salaire', 2000)])
    expect(r.replacedEntryIds).toEqual(['m1'])
    expect(r.plannedVsActual).toEqual([{ categoryCode: 'alimentation', planned: 40000, actual: 55000 }])
    expect(r.entries.filter((x) => x.categoryCode === 'alimentation')).toHaveLength(1)
    expect(r).toMatchObject({ incomeSource: 'mixed', expensesSource: 'mixed' })
  })
})

describe('complétude', () => {
  it('signale l’absence de revenu sur les relevés et les montants non classés, sans rien inventer', () => {
    const r = assessCompleteness({ entries: [e('logement', 700)], situation: null, statementMonths: 2, pendingReviewCount: 0, unclassifiedAmount: 12000, excludedImportCount: 1 })
    expect(r.missing.map((m) => m.key)).toEqual(expect.arrayContaining(['statements_without_income', 'unclassified', 'excluded_import', 'short_statement_period']))
    expect(r.missing.find((m) => m.key === 'unclassified')!.impact).toMatch(/120/)
    expect(r.reliability).toBe('low')
  })

  it('précise quelles conclusions sont fiables, estimées ou indisponibles', () => {
    const r = assessCompleteness({
      entries: [e('salaire', 2000), e('logement', 700), e('energie_eau', 80), e('alimentation', 350)],
      situation: { savingsAvailable: 100000, debtRemaining: 0, hasPaymentDelays: false, mainGoal: 'build_emergency_fund', householdSize: 2 },
      statementMonths: 3,
      pendingReviewCount: 0,
      incomeSource: 'statements',
      expensesSource: 'mixed',
      hasClosingBalance: true,
      comparableMonths: 3,
    })
    expect(r).toMatchObject({ score: 100, reliability: 'high' })
    expect(Object.fromEntries(r.conclusions.map((c) => [c.label, c.level]))).toEqual({
      'Revenus mensuels': 'fiable',
      'Dépenses mensuelles': 'estime',
      Endettement: 'fiable',
      'Risque de découvert': 'estime',
      'Évolution des dépenses': 'fiable',
    })
  })
})
