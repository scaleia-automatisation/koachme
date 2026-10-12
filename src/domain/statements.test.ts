import { describe, expect, it } from 'vitest'
import {
  analyzeTransactions,
  categorize,
  categoryTrends,
  coveredMonths,
  groupForReview,
  merchantKey,
  monthCoverage,
  nextOccurrence,
  statementFigures,
  type ImportInfo,
  type RawTransaction,
} from '@/domain'

let seq = 0
function tx(p: Partial<RawTransaction> & Pick<RawTransaction, 'opDate' | 'label' | 'amount'>): RawTransaction {
  return {
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
  }
}
const imp = (id: string, accountKey: string, periodStart: string, periodEnd: string, extra: Partial<ImportInfo> = {}): ImportInfo => ({
  id,
  accountKey,
  periodStart,
  periodEnd,
  closingBalance: null,
  createdAt: '2026-01-01',
  ...extra,
})
const NO_RULES = new Map<string, string>()
const IMPORTS = [imp('imp1', 'courant', '2026-01-01', '2026-02-28')]
const analyze = (txs: RawTransaction[], imports = IMPORTS) => analyzeTransactions(txs, imports, NO_RULES)
const one = (t: RawTransaction, imports = IMPORTS) => analyze([t], imports)[0]

describe('merchantKey', () => {
  it('retire préfixes bancaires, dates et références', () => {
    expect(merchantKey('PRLV SEPA NETFLIX.COM 12/03 REF 88123456')).toBe('NETFLIX COM')
    expect(merchantKey('PAIEMENT PAR CARTE X4521 CARREFOUR MARKET 03/02')).toBe('CARREFOUR MARKET')
    expect(merchantKey('CB Carrefour Market 15/02')).toBe('CARREFOUR MARKET')
  })
  it('ignore les mois et années dans le libellé', () => {
    expect(merchantKey('PRLV SEPA FONCIA LOYER JANVIER')).toBe(merchantKey('PRLV SEPA FONCIA LOYER FEVRIER'))
    expect(merchantKey('VIR SALAIRE ACME DEC 2025')).toBe(merchantKey('VIR SALAIRE ACME JANV 2026'))
  })
  it('donne la même clé pour deux occurrences du même marchand', () => {
    expect(merchantKey('PRLV SEPA FREE MOBILE 05/01 ECH 552211')).toBe(merchantKey('PRLV SEPA FREE MOBILE 05/02 ECH 552298'))
  })
})

describe('règles financières obligatoires (§3.3)', () => {
  it('ne considère pas chaque crédit comme un revenu', () => {
    expect(one(tx({ opDate: '2026-01-10', label: 'VIR M DUPONT', amount: 5000 })).treatment).toBe('review')
    expect(one(tx({ opDate: '2026-01-10', label: 'VIR SALAIRE ACME', amount: 200000 })).treatment).toBe('income')
  })

  it('ne considère pas chaque débit comme une dépense de consommation', () => {
    expect(one(tx({ opDate: '2026-01-10', label: 'VIR VERS LIVRET A', amount: -20000 })).treatment).toBe('savings')
    expect(one(tx({ opDate: '2026-01-10', label: 'VIREMENT INTERNE VERS COMPTE JOINT', amount: -30000 })).treatment).toBe('transfer')
    expect(one(tx({ opDate: '2026-01-10', label: 'OPERATION X', amount: -3000 })).treatment).toBe('review')
  })

  it('ne compte jamais un virement entre deux comptes importés comme dépense ou revenu', () => {
    const imports = [imp('a', 'courant', '2026-01-01', '2026-01-31'), imp('b', 'joint', '2026-01-01', '2026-01-31')]
    const r = analyze(
      [tx({ importId: 'a', opDate: '2026-01-10', label: 'VIR M DURAND', amount: -50000 }), tx({ importId: 'b', opDate: '2026-01-11', label: 'VIR DE M DURAND', amount: 50000 })],
      imports,
    )
    expect(r.map((x) => x.treatment)).toEqual(['transfer', 'transfer'])
    expect(r[0].transferPairId).toBe(r[1].id)
    const fig = statementFigures(r, imports)
    expect(fig.entries).toEqual([])
    expect(fig.transfers).toEqual({ count: 2, total: 50000 })
  })

  it('ne compte pas un remboursement comme un revenu ordinaire', () => {
    const r = analyze([
      tx({ opDate: '2026-01-05', label: 'CB PHARMACIE', amount: -4000 }),
      tx({ opDate: '2026-01-20', label: 'VIR CPAM REMBOURSEMENT', amount: 2800 }),
    ])
    expect(r[1].treatment).toBe('refund')
    const fig = statementFigures(r, IMPORTS)
    expect(fig.entries.find((e) => e.categoryCode === 'remboursement')).toBeDefined()
    expect(fig.entries.some((e) => e.categoryCode === 'autres_revenus' || e.categoryCode === 'salaire')).toBe(false)
  })

  it('ne confond pas une opération en attente avec une opération comptabilisée', () => {
    const r = analyze([tx({ opDate: '2026-02-27', label: 'CB LIDL', amount: -8000, isPending: true })])
    expect(r[0]).toMatchObject({ treatment: 'pending', needsReview: false })
    const fig = statementFigures(r, IMPORTS)
    expect(fig.entries).toEqual([])
    expect(fig.pending).toEqual({ count: 1, total: -8000 })
  })

  it('n’intègre pas les opérations à vérifier dans les montants, mais les isole', () => {
    const fig = statementFigures(analyze([tx({ opDate: '2026-01-10', label: 'OPERATION X', amount: -3000 })]), IMPORTS)
    expect(fig.entries).toEqual([])
    expect(fig.toConfirm).toEqual({ count: 1, credits: 0, debits: 3000 })
  })
})

describe('catégorisation', () => {
  it('applique l’ordre : utilisateur > historique > mots-clés > IA > à vérifier', () => {
    const base = { label: 'CB CARREFOUR MARKET', amount: -4500, aiCategoryCode: 'shopping', aiConfidence: 0.9, userCategoryCode: null }
    expect(categorize(base, NO_RULES)).toMatchObject({ categoryCode: 'alimentation', source: 'rule' })
    expect(categorize(base, new Map([['CARREFOUR MARKET', 'enfants']]))).toMatchObject({ categoryCode: 'enfants', source: 'history' })
    expect(categorize({ ...base, userCategoryCode: 'cadeaux_dons' }, NO_RULES)).toMatchObject({ source: 'user' })
    expect(categorize({ ...base, label: 'CB BOUTIQUE XYZ' }, NO_RULES)).toMatchObject({ categoryCode: 'shopping', source: 'ai' })
    expect(categorize({ ...base, label: 'CB BOUTIQUE XYZ', aiCategoryCode: null }, NO_RULES)).toMatchObject({ categoryCode: 'a_verifier', source: 'fallback' })
  })

  it('refuse une suggestion de l’IA incompatible avec le sens de l’opération', () => {
    expect(categorize({ label: 'OPERATION', amount: -1000, aiCategoryCode: 'salaire', aiConfidence: 0.99, userCategoryCode: null }, NO_RULES).source).toBe('fallback')
    expect(categorize({ label: 'OPERATION', amount: 1000, aiCategoryCode: 'shopping', aiConfidence: 0.99, userCategoryCode: null }, NO_RULES).source).toBe('fallback')
  })

  it('autorise l’utilisateur à rattacher un crédit à une catégorie de dépense, jamais un débit à un revenu', () => {
    expect(categorize({ label: 'AMAZON', amount: 3000, aiCategoryCode: null, aiConfidence: null, userCategoryCode: 'shopping' }, NO_RULES).source).toBe('user')
    expect(categorize({ label: 'X', amount: -3000, aiCategoryCode: null, aiConfidence: null, userCategoryCode: 'salaire' }, NO_RULES).source).not.toBe('user')
  })

  it('distingue Uber Eats d’Uber, TotalEnergies d’une station, retraite d’un retrait', () => {
    const c = (label: string, amount = -2000) => categorize({ label, amount, aiCategoryCode: null, aiConfidence: null, userCategoryCode: null }, NO_RULES).categoryCode
    expect(c('CB UBER EATS PARIS')).toBe('restaurants_livraisons')
    expect(c('CB UBER TRIP')).toBe('transport')
    expect(c('PRLV TOTALENERGIES ELEC')).toBe('energie_eau')
    expect(c('CB TOTAL ACCESS STATION')).toBe('transport')
    expect(c('RETRAIT DAB 12/01')).toBe('retraits_especes')
    expect(c('VIR CARSAT RETRAITE', 120000)).toBe('pensions_retraites')
  })
})

describe('doublons, récurrences, confirmations', () => {
  const imports = [imp('imp1', 'compte', '2026-01-01', '2026-02-28', { createdAt: '2026-03-01' }), imp('imp2', 'compte', '2026-02-01', '2026-03-31', { createdAt: '2026-04-01' })]

  it('détecte les doublons entre relevés qui se chevauchent', () => {
    const a = tx({ importId: 'imp1', opDate: '2026-02-10', label: 'CB LIDL 10/02', amount: -3210 })
    const b = tx({ importId: 'imp2', opDate: '2026-02-10', label: 'CB LIDL 10/02', amount: -3210 })
    const r = analyze([b, a], imports)
    expect(r.find((x) => x.id === b.id)).toMatchObject({ duplicateOf: a.id, excluded: true, treatment: 'excluded' })
    expect(r.find((x) => x.id === a.id)?.excluded).toBe(false)
  })

  it('ne confond pas deux achats identiques d’un même relevé avec des doublons', () => {
    expect(analyze([tx({ opDate: '2026-02-10', label: 'CB BOULANGERIE', amount: -250 }), tx({ opDate: '2026-02-10', label: 'CB BOULANGERIE', amount: -250 })], imports).every((x) => !x.excluded)).toBe(true)
  })

  it('détecte les opérations récurrentes', () => {
    const r = analyze(
      [tx({ opDate: '2026-01-05', label: 'PRLV FREE MOBILE ECH 552211', amount: -1999 }), tx({ opDate: '2026-02-05', label: 'PRLV FREE MOBILE ECH 552298', amount: -1999 }), tx({ opDate: '2026-02-12', label: 'CB FNAC', amount: -8900 })],
      imports,
    )
    expect(r.filter((x) => x.isRecurring).map((x) => x.merchantKey)).toEqual(['FREE MOBILE', 'FREE MOBILE'])
  })

  it('ne demande confirmation que pour les opérations ambiguës ou importantes, sauf décision déjà prise', () => {
    const r = analyze(
      [
        tx({ opDate: '2026-01-05', label: 'CB CARREFOUR', amount: -45000 }),
        tx({ opDate: '2026-01-06', label: 'CB BOUTIQUE A', amount: -2000, aiCategoryCode: 'shopping', aiConfidence: 0.9 }),
        tx({ opDate: '2026-01-07', label: 'CB BOUTIQUE B', amount: -2000, aiCategoryCode: 'shopping', aiConfidence: 0.4 }),
        tx({ opDate: '2026-01-08', label: 'VIR X', amount: -60000, aiCategoryCode: 'logement', aiConfidence: 0.9 }),
        tx({ opDate: '2026-01-09', label: 'OPERATION ?', amount: -1500 }),
        tx({ opDate: '2026-01-10', label: 'CB BOUTIQUE C', amount: -2000, aiCategoryCode: 'shopping', aiConfidence: 0.3, reviewStatus: 'confirmed' }),
      ],
      imports,
    )
    expect(r.map((x) => x.needsReview)).toEqual([false, false, true, true, true, false])
  })

  it('regroupe les confirmations par marchand, les plus gros montants en premier', () => {
    const r = analyze([tx({ opDate: '2026-01-07', label: 'CB BOUTIQUE B', amount: -2000 }), tx({ opDate: '2026-01-17', label: 'CB BOUTIQUE B', amount: -3000 }), tx({ opDate: '2026-01-09', label: 'VIR M MARTIN', amount: -70000 })], imports)
    expect(groupForReview(r).map((g) => [g.merchantKey, g.transactions.length, g.total])).toEqual([
      ['M MARTIN', 1, 70000],
      ['BOUTIQUE B', 2, 5000],
    ])
  })
})

describe('opérations exceptionnelles', () => {
  const salaries = [tx({ opDate: '2026-01-28', label: 'VIR SALAIRE ACME', amount: 200000 }), tx({ opDate: '2026-02-27', label: 'VIR SALAIRE ACME', amount: 200000 })]

  it('isole une prime des revenus réguliers', () => {
    const r = analyze([...salaries, tx({ opDate: '2026-02-27', label: 'VIR ACME PRIME ANNUELLE', amount: 150000, userCategoryCode: 'salaire' })])
    expect(r[2].exceptional).toBe(true)
    const fig = statementFigures(r, IMPORTS)
    expect(fig.entries.find((e) => e.categoryCode === 'salaire')?.amount).toBe(200000)
    expect(fig.exceptionalIncome).toHaveLength(1)
  })

  it('isole une grosse dépense ponctuelle, jamais une charge fixe', () => {
    const r = analyze([...salaries, tx({ opDate: '2026-01-15', label: 'CB DARTY TV', amount: -89900 }), tx({ opDate: '2026-01-02', label: 'PRLV LOYER FONCIA', amount: -90000 })])
    expect(r[2].exceptional).toBe(true)
    expect(r[3].exceptional).toBe(false)
    const fig = statementFigures(r, IMPORTS)
    expect(fig.entries.some((e) => e.categoryCode === 'shopping')).toBe(false)
    expect(fig.exceptionalExpenses.map((x) => x.label)).toEqual(['CB DARTY TV'])
  })

  it('respecte le choix de l’utilisateur', () => {
    expect(one(tx({ opDate: '2026-01-15', label: 'CB DARTY TV', amount: -89900, userExceptional: false })).exceptional).toBe(false)
  })
})

describe('périodes et normalisation', () => {
  it('compte les mois calendaires exacts et fusionne les chevauchements', () => {
    expect(coveredMonths([{ start: '2026-01-01', end: '2026-02-28' }])).toBe(2)
    expect(coveredMonths([{ start: '2026-01-16', end: '2026-02-15' }])).toBeCloseTo(16 / 31 + 15 / 28, 6)
    expect(coveredMonths([{ start: '2026-01-01', end: '2026-02-28' }, { start: '2026-02-01', end: '2026-03-31' }])).toBe(3)
    expect(coveredMonths([{ start: '2026-01-01', end: '2026-01-10' }])).toBe(1)
  })

  it('mesure la couverture de chaque mois', () => {
    expect(Object.fromEntries(monthCoverage([{ start: '2026-01-16', end: '2026-02-28' }]))).toEqual({ '2026-01': 16 / 31, '2026-02': 1 })
  })

  it('compare les catégories sur des mois normalisés, jamais sur des mois partiels bruts', () => {
    const imports = [imp('imp1', 'c', '2026-01-01', '2026-02-14')]
    const r = analyze([tx({ opDate: '2026-01-10', label: 'CB LIDL', amount: -40000 }), tx({ opDate: '2026-02-10', label: 'CB LIDL', amount: -20000 })], imports)
    const fig = statementFigures(r, imports)
    const months = fig.monthlyByCategory.get('alimentation')!
    expect(months[1]).toMatchObject({ month: '2026-02', amount: 40000, coverage: 0.5 })
    expect(categoryTrends(fig.monthlyByCategory)[0]).toMatchObject({ change: 0, ratio: 0 })
  })
})

describe('chiffres issus des relevés', () => {
  it('calcule des moyennes mensuelles et additionne les comptes sur leur propre période', () => {
    const imports = [imp('a', 'courant', '2026-01-01', '2026-03-31'), imp('b', 'joint', '2026-03-01', '2026-03-31')]
    const r = analyze([tx({ importId: 'a', opDate: '2026-01-15', label: 'CB LIDL', amount: -30000 }), tx({ importId: 'b', opDate: '2026-03-15', label: 'CB LIDL', amount: -12000 })], imports)
    const fig = statementFigures(r, imports)
    expect(fig.entries[0].amount).toBe(10000 + 12000)
    expect(fig.monthsByAccount).toEqual({ courant: 3, joint: 1 })
    expect(fig.period).toEqual({ start: '2026-01-01', end: '2026-03-31' })
  })

  it('calcule le solde des opérations de la période et le solde après engagements', () => {
    const imports = [imp('imp1', 'courant', '2025-12-01', '2026-02-20', { closingBalance: 50000 })]
    const r = analyze(
      [
        tx({ opDate: '2025-12-25', label: 'VIR SALAIRE ACME', amount: 200000 }),
        tx({ opDate: '2026-01-25', label: 'VIR SALAIRE ACME', amount: 200000 }),
        tx({ opDate: '2025-12-02', label: 'PRLV LOYER FONCIA', amount: -80000 }),
        tx({ opDate: '2026-01-02', label: 'PRLV LOYER FONCIA', amount: -80000 }),
        tx({ opDate: '2026-02-02', label: 'PRLV LOYER FONCIA', amount: -80000 }),
        tx({ opDate: '2025-12-22', label: 'PRLV EDF', amount: -7000 }),
        tx({ opDate: '2026-01-22', label: 'PRLV EDF', amount: -7000 }),
      ],
      imports,
    )
    const acc = statementFigures(r, imports).accounts[0]
    expect(acc.netFlow).toBe(2 * 200000 - 3 * 80000 - 2 * 7000)
    // Fin du relevé le 20/02, prochain salaire le 25 : seul EDF (22) tombe avant ; le loyer (2 mars) après.
    expect(acc.upcomingCommitments).toBe(7000)
    expect(acc.availableAfterCommitments).toBe(43000)
  })

  it('ne classe jamais exceptionnelle une dépense essentielle', () => {
    expect(one(tx({ opDate: '2026-01-15', label: 'CB LIDL GROS PLEIN', amount: -45000 })).exceptional).toBe(false)
  })

  it('cale l’horizon des engagements sur le revenu principal, pas sur une petite allocation', () => {
    const imports = [imp('imp1', 'courant', '2026-01-01', '2026-02-28', { closingBalance: 100000 })]
    const r = analyze(
      [
        tx({ opDate: '2026-01-27', label: 'VIR SALAIRE ACME', amount: 200000 }),
        tx({ opDate: '2026-02-27', label: 'VIR SALAIRE ACME', amount: 200000 }),
        tx({ opDate: '2026-01-20', label: 'VIR CAF', amount: 18000 }),
        tx({ opDate: '2026-02-20', label: 'VIR CAF', amount: 18000 }),
        tx({ opDate: '2026-01-25', label: 'PRLV COFIDIS PRET', amount: -15000 }),
        tx({ opDate: '2026-02-25', label: 'PRLV COFIDIS PRET', amount: -15000 }),
      ],
      imports,
    )
    // Prochain salaire le 27 mars : le crédit du 25 mars est un engagement à couvrir.
    expect(statementFigures(r, imports).accounts[0].upcomingCommitments).toBe(15000)
  })

  it('calcule la prochaine occurrence d’un jour du mois', () => {
    expect(nextOccurrence('2026-02-20', 25)).toBe('2026-02-25')
    expect(nextOccurrence('2026-02-20', 5)).toBe('2026-03-05')
    expect(nextOccurrence('2026-01-31', 31)).toBe('2026-02-28')
  })
})
