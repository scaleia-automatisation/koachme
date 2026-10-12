import { afterEach, describe, expect, it } from 'vitest'
import {
  allCategories,
  allGroups,
  DEFAULT_CATEGORIES,
  DEFAULT_GROUPS,
  DEFAULT_KEYWORD_RULES,
  formatEuros,
  formatPercent,
  getCategory,
  findCategory,
  parseEuros,
  resetCategoryRegistry,
  resetThresholds,
  setCategoryRegistry,
  setThresholds,
  summarizeBudget,
  thresholds,
  toMonthly,
  categorize,
  type BudgetEntry,
} from '@/domain'

const nbsp = (s: string) => s.replace(/[  ]/g, ' ')

afterEach(() => {
  resetCategoryRegistry()
  resetThresholds()
})

describe('montants', () => {
  it('parse les saisies françaises et anglaises', () => {
    expect(parseEuros('1 234,56')).toBe(123456)
    expect(parseEuros('1234.5')).toBe(123450)
    expect(parseEuros('800 €')).toBe(80000)
    expect(parseEuros('0,1')).toBe(10)
    expect(parseEuros(19.99)).toBe(1999)
  })

  it('refuse les saisies invalides', () => {
    expect(parseEuros('')).toBeNull()
    expect(parseEuros('abc')).toBeNull()
    expect(parseEuros('12,345')).toBeNull()
    expect(parseEuros(Number.NaN)).toBeNull()
  })

  it('évite les erreurs d’arrondi flottant', () => {
    expect(parseEuros('0,29')).toBe(29)
    expect(parseEuros('1,15')).toBe(115)
  })

  it('formate en euros et en pourcentage', () => {
    expect(nbsp(formatEuros(123456))).toBe('1 234,56 €')
    expect(nbsp(formatEuros(150000))).toBe('1 500 €')
    expect(nbsp(formatEuros(-2500, { signed: true }))).toBe('-25 €')
    expect(nbsp(formatEuros(2500, { signed: true }))).toBe('+25 €')
    expect(nbsp(formatPercent(0.125, 1))).toBe('12,5 %')
  })
})

describe('fréquences', () => {
  it('ramène les montants au mois', () => {
    expect(toMonthly(10000, 'monthly')).toBe(10000)
    expect(toMonthly(120000, 'yearly')).toBe(10000)
    expect(toMonthly(30000, 'quarterly')).toBe(10000)
    expect(toMonthly(10000, 'weekly')).toBe(43333)
    expect(toMonthly(120000, 'once')).toBe(10000)
  })

  it('refuse les montants non entiers', () => {
    expect(() => toMonthly(10.5, 'monthly')).toThrow()
  })
})

describe('référentiel des catégories', () => {
  it('couvre tous les groupes exigés par le cahier des charges', () => {
    const labels = DEFAULT_GROUPS.map((g) => g.label)
    for (const required of [
      'Revenus', 'Logement', 'Factures et énergie', 'Alimentation', 'Transport', 'Santé', 'Assurances', 'Télécommunications',
      'Abonnements', 'Restaurants et loisirs', 'Shopping', 'Famille et enfants', 'Crédits et dettes', 'Frais bancaires', 'Épargne',
      'Transferts entre comptes', 'Remboursements reçus', 'Autres opérations', 'Opérations à vérifier',
    ]) expect(labels).toContain(required)
  })

  it('a des codes uniques, chaque catégorie dans un groupe existant', () => {
    const codes = DEFAULT_CATEGORIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    const groups = new Set(DEFAULT_GROUPS.map((g) => g.code))
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.code).toMatch(/^[a-z][a-z_]*$/)
      expect(groups.has(c.groupCode)).toBe(true)
      expect(c.nature !== null).toBe(c.kind === 'expense')
    }
  })

  it('a des règles par mots-clés valides et rattachées à une catégorie existante', () => {
    for (const r of DEFAULT_KEYWORD_RULES) {
      expect(() => new RegExp(r.pattern)).not.toThrow()
      expect(DEFAULT_CATEGORIES.some((c) => c.code === r.categoryCode)).toBe(true)
    }
  })

  it('est extensible sans modifier le code : nouvelle catégorie et nouvelle règle', () => {
    setCategoryRegistry(
      [...DEFAULT_CATEGORIES, { code: 'animaux', label: 'Animaux', kind: 'expense', nature: 'variable', groupCode: 'famille_enfants', isDebt: false, isEssential: false, icon: 'paw-print', sortOrder: 245 }],
      DEFAULT_GROUPS,
      [{ pattern: '\\b(VETERINAIRE|CROQUETTES)\\b', categoryCode: 'animaux', priority: 1 }, ...DEFAULT_KEYWORD_RULES],
    )
    expect(getCategory('animaux').label).toBe('Animaux')
    expect(allCategories().some((c) => c.code === 'animaux')).toBe(true)
    expect(categorize({ label: 'CB VETERINAIRE DU PARC', amount: -4500, aiCategoryCode: null, aiConfidence: null, userCategoryCode: null }, new Map()).categoryCode).toBe('animaux')
    expect(allGroups()).toHaveLength(DEFAULT_GROUPS.length)
  })

  it('ignore une règle invalide saisie en base au lieu de bloquer l’analyse', () => {
    setCategoryRegistry(DEFAULT_CATEGORIES, DEFAULT_GROUPS, [{ pattern: '([', categoryCode: 'shopping', priority: 1 }, ...DEFAULT_KEYWORD_RULES])
    expect(categorize({ label: 'CB LIDL', amount: -1000, aiCategoryCode: null, aiConfidence: null, userCategoryCode: null }, new Map()).categoryCode).toBe('alimentation')
  })

  it('affiche une catégorie supprimée comme « à vérifier » sans planter', () => {
    expect(() => getCategory('inexistante')).toThrow()
    expect(findCategory('inexistante').kind).toBe('review')
  })
})

describe('seuils configurables', () => {
  it('applique les valeurs de la base et ignore les valeurs invalides', () => {
    setThresholds({ debtRatioMax: 0.33, savingsRateTarget: -1, inconnu: 5 } as never)
    expect(thresholds().debtRatioMax).toBe(0.33)
    expect(thresholds().savingsRateTarget).toBe(0.1)
  })
})

const entry = (categoryCode: string, euros: number, frequency: BudgetEntry['frequency'] = 'monthly'): BudgetEntry => ({ categoryCode, amount: euros * 100, frequency })

describe('résumé budgétaire', () => {
  const s = summarizeBudget([
    entry('salaire', 2500),
    entry('aides_allocations', 100),
    entry('logement', 800),
    entry('credits_consommation', 200),
    entry('assurances', 1200, 'yearly'),
    entry('alimentation', 400),
    entry('abonnements', 60),
    entry('restaurants_livraisons', 150),
    entry('epargne', 300),
  ])

  it('calcule les totaux mensuels', () => {
    expect(s.income).toBe(260000)
    expect(s.expensesByNature).toEqual({ fixed: 110000, variable: 40000, reducible: 21000 })
    expect(s.expenses).toBe(171000)
    expect(s.debtRepayments).toBe(20000)
    expect(s.essentialExpenses).toBe(80000 + 20000 + 10000 + 40000)
    expect(s.savings).toBe(30000)
    expect(s.balance).toBe(260000 - 171000 - 30000)
    expect(s.remainingAfterFixed).toBe(150000)
  })

  it('calcule les ratios', () => {
    expect(s.savingsRate).toBeCloseTo(30000 / 260000)
    expect(s.debtRatio).toBeCloseTo(20000 / 260000)
    expect(s.fixedChargesRatio).toBeCloseTo(110000 / 260000)
  })

  it('un remboursement réduit les dépenses et n’est jamais un revenu', () => {
    const r = summarizeBudget([entry('salaire', 2000), entry('sante', 100), entry('remboursement', 60)])
    expect(r.income).toBe(200000)
    expect(r.expenses).toBe(4000)
    expect(r.refunds).toBe(6000)
  })

  it('un transfert entre comptes et une opération à vérifier ne sont jamais comptés', () => {
    const r = summarizeBudget([entry('salaire', 2000), entry('transfert_interne', 500), entry('a_verifier', 300)])
    expect(r.income).toBe(200000)
    expect(r.expenses).toBe(0)
    expect(r.balance).toBe(200000)
  })

  it('renvoie des ratios null sans revenu et gère un budget vide', () => {
    expect(summarizeBudget([entry('logement', 500)]).savingsRate).toBeNull()
    expect(summarizeBudget([])).toMatchObject({ income: 0, balance: 0, byCategory: [] })
  })

  it('refuse un montant négatif', () => {
    expect(() => summarizeBudget([entry('salaire', -10)])).toThrow()
  })
})
