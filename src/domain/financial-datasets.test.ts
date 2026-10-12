// Jeux de données financiers contrôlés (cahier des charges §7.2).
//
// Un foyer fictif sur trois mois, quatre comptes, avec tous les cas difficiles :
// salaire et charges fixes, revenus complémentaires irréguliers, virements entre
// comptes, remboursements, dépenses récurrentes, relevés qui se chevauchent
// (doublons), opérations incertaines et en attente, périodes différentes selon
// les comptes, prime et achat exceptionnels, relevé aux soldes incohérents,
// revenus déclarés hors relevés.
//
// Chaque résultat attendu est calculé à la main dans les commentaires : aucun
// chiffre central ne dépend d'une vérification visuelle ni d'une réponse d'IA.
import { describe, expect, it } from 'vitest'
import {
  checkStatementBalance,
  computeAnalysis,
  compareMonths,
  normalizeMonth,
  type AnalysisInput,
  type DeclaredEntry,
  type ImportRecord,
  type RawTransaction,
} from '@/domain'

let seq = 0
function tx(importId: string, opDate: string, label: string, euros: number, extra: Partial<RawTransaction> = {}): RawTransaction {
  return {
    id: `t${++seq}`,
    importId,
    opDate,
    label,
    amount: Math.round(euros * 100),
    currency: 'EUR',
    isPending: false,
    aiCategoryCode: null,
    aiConfidence: null,
    userCategoryCode: null,
    userExcluded: null,
    userExceptional: null,
    reviewStatus: 'auto',
    ...extra,
  }
}

function imp(id: string, accountKey: string, periodStart: string, periodEnd: string, extra: Partial<ImportRecord> = {}): ImportRecord {
  return { id, accountKey, periodStart, periodEnd, closingBalance: null, createdAt: '2026-04-01T00:00:00Z', status: 'confirmed', balanceCheck: 'ok', ...extra }
}

// ---------------------------------------------------------------------------
// Compte courant : janvier (C1), février-mars (C2), puis un relevé de la
// seconde quinzaine de mars (C3) importé plus tard, qui recoupe C2.
// ---------------------------------------------------------------------------
const MONTHS = ['01', '02', '03'] as const
const courant: RawTransaction[] = []
for (const m of MONTHS) {
  const id = m === '01' ? 'C1' : 'C2'
  courant.push(
    tx(id, `2026-${m}-28`, 'VIREMENT SALAIRE ACME', 2500), // salaire régulier
    tx(id, `2026-${m}-05`, 'CAF ALLOCATIONS FAMILIALES', 150), // aide régulière
    tx(id, `2026-${m}-03`, 'PRLV SEPA LOYER FONCIA', -800), // charge fixe essentielle
    tx(id, `2026-${m}-10`, 'PRLV SEPA EDF', -60),
    tx(id, `2026-${m}-12`, 'PAIEMENT CB NETFLIX', -13.49), // abonnement récurrent
    tx(id, `2026-${m}-15`, 'VIR VERS LIVRET A', -300), // vers le livret (importé)
    tx(id, `2026-${m}-30`, 'FRAIS TENUE DE COMPTE', -2.5),
  )
}
courant.push(
  // Courses : 200 + 220 + 180 = 600 € sur 3 mois → 200 €/mois
  tx('C1', '2026-01-20', 'CB CARREFOUR MARKET', -200),
  tx('C2', '2026-02-20', 'CB CARREFOUR MARKET', -220),
  tx('C2', '2026-03-20', 'CB CARREFOUR MARKET', -180),
  // Santé et remboursement : 40 € dépensés, 25 € remboursés
  tx('C2', '2026-02-08', 'CB PHARMACIE DU CENTRE', -40),
  tx('C2', '2026-02-18', 'AMELI REMBOURSEMENT SOINS', 25),
  // Revenus complémentaires irréguliers (suggérés par l'IA) : 400 + 250 = 650 € → 216,67 €/mois
  tx('C1', '2026-01-22', 'VIR SEPA RECU MALT', 400, { aiCategoryCode: 'revenus_independants', aiConfidence: 0.9 }),
  tx('C2', '2026-03-22', 'VIR SEPA RECU MALT', 250, { aiCategoryCode: 'revenus_independants', aiConfidence: 0.9 }),
  // Exceptionnels : jamais dans les moyennes
  tx('C2', '2026-02-14', 'CB IKEA', -900),
  tx('C2', '2026-03-30', 'PRIME ANNUELLE SALAIRE ACME', 1000),
  // Incertaine : chèque sans libellé exploitable
  tx('C1', '2026-01-25', 'CHEQUE 1234567', -150),
  // En attente : pas encore comptabilisée
  tx('C2', '2026-03-31', 'PAIEMENT CB AMAZON MARKETPLACE', -45, { isPending: true }),
  // Doublons : C3 reprend des opérations déjà présentes dans C2
  tx('C3', '2026-03-20', 'CB CARREFOUR MARKET', -180),
  tx('C3', '2026-03-28', 'VIREMENT SALAIRE ACME', 2500),
)

// Livret : l'autre jambe des virements (libellé sans mot-clé reconnaissable).
const livret = MONTHS.map((m) => tx('L1', `2026-${m}-16`, 'VIR RECU M MARTIN', 300))

// Compte joint : uniquement mars (période différente des autres comptes).
const joint = [tx('J1', '2026-03-09', 'CB LECLERC', -300)]

// Carte : soldes incohérents, non validée par l'utilisateur.
const carte = [tx('K1', '2026-03-12', 'CB FNAC', -500)]

const IMPORTS: ImportRecord[] = [
  imp('C1', 'courant', '2026-01-01', '2026-01-31', { createdAt: '2026-04-01T10:00:00Z' }),
  imp('C2', 'courant', '2026-02-01', '2026-03-31', { createdAt: '2026-04-01T10:01:00Z', closingBalance: 150000 }),
  imp('C3', 'courant', '2026-03-15', '2026-03-31', { createdAt: '2026-04-02T10:00:00Z', closingBalance: 150000 }),
  imp('L1', 'livret', '2026-01-01', '2026-03-31'),
  imp('J1', 'joint', '2026-03-01', '2026-03-31'),
  imp('K1', 'carte', '2026-03-01', '2026-03-31', { status: 'needs_review', balanceCheck: 'mismatch' }),
]

const DECLARED: DeclaredEntry[] = [
  // Revenu absent des relevés (loyer perçu sur un compte non importé) : ajouté
  { id: 'd1', categoryCode: 'revenus_locatifs', label: 'Studio', amount: 40000, frequency: 'monthly', source: 'off_statement' },
  // Loyer déclaré à la main : remplacé par le montant constaté (800 €)
  { id: 'd2', categoryCode: 'logement', label: null, amount: 75000, frequency: 'monthly', source: 'manual' },
]

function analyze(over: Partial<AnalysisInput> = {}) {
  return computeAnalysis({
    declared: DECLARED,
    imports: IMPORTS,
    transactions: [...courant, ...livret, ...joint, ...carte],
    rules: new Map(),
    situation: { savingsAvailable: 200000, debtRemaining: 0, hasPaymentDelays: false, mainGoal: null, householdSize: 2 },
    goals: [{ id: 'g1', name: 'Précaution', targetAmount: 600000, savedAmount: 200000, contributionsTotal: 0, monthlyContribution: null, targetDate: null }],
    today: '2026-04-05',
    ...over,
  })
}

const a = analyze()
const byId = new Map(a.analyzed.map((t) => [t.id, t]))
const find = (importId: string, label: string, date?: string) => a.analyzed.find((t) => t.importId === importId && t.label === label && (!date || t.opDate === date))!
const entry = (code: string) => a.summary.byCategory.find((c) => c.categoryCode === code)?.monthly ?? 0

describe('jeu de données « foyer Martin » : classement des opérations', () => {
  it('reconnaît les revenus, charges et dépenses par leurs libellés', () => {
    expect(find('C1', 'VIREMENT SALAIRE ACME').categoryCode).toBe('salaire')
    expect(find('C1', 'CAF ALLOCATIONS FAMILIALES').categoryCode).toBe('aides_allocations')
    expect(find('C1', 'PRLV SEPA LOYER FONCIA').categoryCode).toBe('logement')
    expect(find('C1', 'CB CARREFOUR MARKET').categoryCode).toBe('alimentation')
    expect(find('C2', 'AMELI REMBOURSEMENT SOINS').treatment).toBe('refund')
  })

  it('apparie les virements entre le courant et le livret : ni dépense, ni revenu, ni épargne comptée deux fois', () => {
    for (const t of a.analyzed.filter((x) => x.label === 'VIR VERS LIVRET A' || x.importId === 'L1')) {
      expect(t.treatment).toBe('transfer')
      expect(t.transferPairId).not.toBeNull()
    }
    expect(a.figures.transfers).toEqual({ count: 6, total: 90000 })
    expect(entry('epargne')).toBe(0)
  })

  it('écarte les doublons du relevé qui recoupe le précédent, en gardant le plus ancien', () => {
    const dups = a.analyzed.filter((t) => t.duplicateOf)
    expect(dups.map((t) => t.importId)).toEqual(['C3', 'C3'])
    expect(dups.every((t) => t.treatment === 'excluded' && byId.get(t.duplicateOf!)!.importId === 'C2')).toBe(true)
  })

  it('détecte les opérations récurrentes, pas les revenus irréguliers', () => {
    const recurring = a.figures.recurring.map((r) => r.categoryCode).sort()
    expect(recurring).toEqual(['abonnements', 'aides_allocations', 'alimentation', 'energie_eau', 'frais_bancaires', 'logement', 'salaire'])
    expect(find('C1', 'VIR SEPA RECU MALT').isRecurring).toBe(false)
  })

  it('isole la prime et le gros achat ponctuel comme exceptionnels', () => {
    expect(a.figures.exceptionalIncome.map((t) => t.label)).toEqual(['PRIME ANNUELLE SALAIRE ACME'])
    // Seuil : max(300 €, 25 % de 2 650 € de revenus réguliers = 662,50 €) → 900 € est exceptionnel
    expect(a.figures.exceptionalExpenses.map((t) => t.label)).toEqual(['CB IKEA'])
  })

  it('met de côté les opérations incertaines et en attente, sans les compter', () => {
    expect(a.figures.toConfirm).toEqual({ count: 1, credits: 0, debits: 15000 })
    expect(a.figures.pending).toEqual({ count: 1, total: -4500 })
  })

  it('n’intègre pas un relevé aux soldes incohérents tant qu’il n’est pas vérifié', () => {
    expect(a.excludedImports.map((i) => i.id)).toEqual(['K1'])
    expect(entry('shopping')).toBe(0)
  })
})

describe('jeu de données « foyer Martin » : montants mensuels', () => {
  it('calcule chaque catégorie sur la période propre à chaque compte', () => {
    expect(entry('salaire')).toBe(250000) // 3 × 2 500 / 3, prime exclue
    expect(entry('aides_allocations')).toBe(15000)
    expect(entry('revenus_independants')).toBe(21667) // 650 / 3
    expect(entry('revenus_locatifs')).toBe(40000) // déclaré hors relevés
    expect(entry('logement')).toBe(80000) // constaté, remplace les 750 € déclarés
    expect(entry('energie_eau')).toBe(6000)
    expect(entry('abonnements')).toBe(1349)
    expect(entry('frais_bancaires')).toBe(250)
    expect(entry('sante')).toBe(1333) // 40 / 3
    expect(entry('alimentation')).toBe(50000) // 600 / 3 (courant) + 300 / 1 (joint, un seul mois)
  })

  it('produit le résumé exact', () => {
    // Revenus : 2 500 + 150 + 216,67 + 400 = 3 266,67 €
    // Dépenses brutes : fixes 860 + courantes 513,33 + réductibles 15,99 = 1 389,32 € ; − 8,33 € remboursés = 1 380,99 €
    expect(a.summary).toMatchObject({
      income: 326667,
      expensesByNature: { fixed: 86000, variable: 51333, reducible: 1599 },
      refunds: 833,
      expenses: 138099,
      savings: 0,
      balance: 188568,
      remainingAfterFixed: 240667,
    })
  })

  it('compare le loyer déclaré au loyer constaté', () => {
    expect(a.merged.replacedEntryIds).toEqual(['d2'])
    expect(a.merged.plannedVsActual).toEqual([{ categoryCode: 'logement', planned: 75000, actual: 80000 }])
    expect(a.merged.incomeSource).toBe('mixed')
  })

  it('calcule le solde disponible après les engagements connus', () => {
    const c = a.figures.accounts.find((x) => x.accountKey === 'courant')!
    // Prochain salaire le 28/04 : loyer (03/04, 800 €), EDF (10/04, 60 €), Netflix (12/04, 13,49 €) et courses
    // habituelles (20/04, médiane 200 €) tombent avant ; les frais (30/04) après ; le virement vers le livret
    // (interne) n'est pas un engagement.
    expect(c).toMatchObject({ months: 3, closingBalance: 150000, upcomingCommitments: 107349, pendingTotal: -4500 })
    expect(c.availableAfterCommitments).toBe(150000 - 4500 - 107349)
  })

  it('compte l’épargne quand le livret n’est pas importé', () => {
    const sansLivret = analyze({ imports: IMPORTS.filter((i) => i.id !== 'L1'), transactions: [...courant, ...joint, ...carte] })
    const epargne = sansLivret.summary.byCategory.find((c) => c.categoryCode === 'epargne')?.monthly
    expect(epargne).toBe(30000)
    expect(sansLivret.summary.savings).toBe(30000)
    expect(sansLivret.summary.balance).toBe(188568 - 30000)
  })

  it('intègre le relevé incohérent une fois vérifié par l’utilisateur', () => {
    const verifie = analyze({ imports: IMPORTS.map((i) => (i.id === 'K1' ? { ...i, status: 'confirmed' as const } : i)) })
    expect(verifie.excludedImports).toEqual([])
    expect(verifie.summary.byCategory.find((c) => c.categoryCode === 'shopping')?.monthly).toBe(50000)
  })

  it('applique les corrections de l’utilisateur sur l’opération incertaine', () => {
    const cheque = find('C1', 'CHEQUE 1234567')
    const corrige = analyze({
      transactions: [...courant, ...livret, ...joint, ...carte].map((t) => (t.id === cheque.id ? { ...t, userCategoryCode: 'scolarite_garde', reviewStatus: 'corrected' as const } : t)),
    })
    expect(corrige.figures.toConfirm.count).toBe(0)
    expect(corrige.summary.byCategory.find((c) => c.categoryCode === 'scolarite_garde')?.monthly).toBe(5000) // 150 / 3
  })
})

describe('jeu de données « foyer Martin » : suivi mensuel', () => {
  const months = a.history

  it('donne un historique par mois calendaire', () => {
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(months.every((m) => m.coverage === 1)).toBe(true)
  })

  it('compte chaque mois une seule fois malgré les doublons, hors exceptionnels', () => {
    // Mars : salaire 2 500 + CAF 150 + Malt 250 ; la prime est exceptionnelle, le salaire de C3 est un doublon
    expect(months[2].income).toBe(290000)
    expect(months[2].exceptionalIncome).toBe(100000)
  })

  it('compare mars à février et signale la hausse des courses (compte joint ajouté)', () => {
    const changes = compareMonths(normalizeMonth(months[1]), normalizeMonth(months[2]))
    const alim = changes.find((c) => c.categoryCode === 'alimentation')
    expect(alim).toMatchObject({ previous: 22000, current: 48000, change: 26000 })
  })

  it('suit la progression de l’objectif avec la capacité d’épargne', () => {
    expect(a.goals[0]).toMatchObject({ current: 200000, remaining: 400000 })
    expect(a.capacity).toBe(188568)
    // 4 000 € restants au rythme de la capacité d'épargne (1 885,68 €/mois) : un peu plus de 2 mois
    expect(a.goals[0].estimate?.basis).toBe('capacity')
    expect(a.goals[0].estimate?.months).toBeCloseTo(400000 / 188568, 6)
    expect(a.goals[0].estimate?.date).toBe('2026-06-09')
  })
})

describe('contrôle des soldes d’un relevé', () => {
  const ops = [
    { amount: 250000, isPending: false },
    { amount: -80000, isPending: false },
    { amount: -4500, isPending: true },
  ]

  it('valide un relevé cohérent, sans compter les opérations en attente', () => {
    expect(checkStatementBalance(100000, 270000, ops)).toEqual({ gap: 0, check: 'ok' })
  })

  it('tolère un centime d’arrondi', () => {
    expect(checkStatementBalance(100000, 270001, ops).check).toBe('ok')
  })

  it('signale un écart', () => {
    expect(checkStatementBalance(100000, 265500, ops)).toEqual({ gap: -4500, check: 'mismatch' })
  })

  it('ne conclut pas sans solde initial ou final', () => {
    expect(checkStatementBalance(null, 270000, ops)).toEqual({ gap: null, check: 'unknown' })
    expect(checkStatementBalance(100000, null, ops).check).toBe('unknown')
  })
})

describe('parcours sans relevé : saisie manuelle à fréquences variées', () => {
  const d = (id: string, categoryCode: string, euros: number, frequency: DeclaredEntry['frequency']): DeclaredEntry => ({
    id,
    categoryCode,
    label: null,
    amount: Math.round(euros * 100),
    frequency,
    source: 'manual',
  })
  const declared = [
    d('1', 'salaire', 1800, 'monthly'),
    d('2', 'revenus_independants', 300, 'quarterly'), // 100 €/mois
    d('3', 'logement', 750, 'monthly'),
    d('4', 'assurances', 600, 'yearly'), // 50 €/mois
    d('5', 'energie_eau', 180, 'quarterly'), // 60 €/mois
    d('6', 'telecom', 35, 'monthly'),
    d('7', 'credits_consommation', 250, 'monthly'),
    d('8', 'alimentation', 90, 'weekly'), // 90 × 52 / 12 = 390 €/mois
    d('9', 'shopping', 1200, 'once'), // lissé sur 12 mois : 100 €/mois
  ]
  const manual = (entries: DeclaredEntry[]) =>
    computeAnalysis({ declared: entries, imports: [], transactions: [], rules: new Map(), situation: null, goals: [], today: '2026-04-05' })
  const m = manual(declared)

  it('ramène chaque montant au mois et produit le résumé exact', () => {
    expect(m.summary).toMatchObject({
      income: 190000,
      expensesByNature: { fixed: 114500, variable: 39000, reducible: 10000 },
      expenses: 163500,
      debtRepayments: 25000,
      balance: 26500,
    })
    expect(m.summary.debtRatio).toBeCloseTo(25000 / 190000, 10)
    expect(m.merged.incomeSource).toBe('declared')
    expect(m.statementMonths).toBe(0)
  })

  it('signale un budget négatif comme prioritaire, avec une recommandation de prévention en tête', () => {
    const negatif = manual([...declared, d('10', 'loisirs_sorties', 400, 'monthly')])
    expect(negatif.summary.balance).toBe(26500 - 40000)
    expect(negatif.diagnosis.status).toBe('prioritaire')
    expect(negatif.diagnosis.findings.some((f) => f.code === 'negative_budget')).toBe(true)
    expect(negatif.priorities[0].key).toBe('prevention:negative_budget')
  })

  it('ne présente aucune économie comme réalisée sans confirmation de l’utilisateur', () => {
    expect(m.confirmedSavings).toBe(0)
    expect(m.recommendations.every((r) => r.confirmedSaving === null)).toBe(true)
  })
})

describe('arrondis au centime', () => {
  it('le total des catégories est égal au total exact, sans dérive d’arrondi', () => {
    // Trois catégories de 20,01 € sur deux mois : 10,005 € chacune, soit 30,015 € au total.
    // Arrondies une à une, elles donneraient 30,03 € ; le total affiché doit être 30,02 €.
    const imports = [imp('X1', 'courant', '2026-01-01', '2026-02-28')]
    const transactions = [
      tx('X1', '2026-01-05', 'CB CARREFOUR', -20.01),
      tx('X1', '2026-01-06', 'CB PHARMACIE', -20.01),
      tx('X1', '2026-01-07', 'CB SNCF', -20.01),
      tx('X1', '2026-01-28', 'VIREMENT SALAIRE', 2000),
      tx('X1', '2026-02-28', 'VIREMENT SALAIRE', 2000),
    ]
    const r = computeAnalysis({ declared: [], imports, transactions, rules: new Map(), situation: null, goals: [], today: '2026-03-05' })
    expect(r.summary.expenses).toBe(3002)
    expect(r.figures.entries.filter((e) => e.categoryCode !== 'salaire').map((e) => e.amount).sort()).toEqual([1000, 1001, 1001])
  })
})
