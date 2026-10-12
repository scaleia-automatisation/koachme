// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Fusion des sources de données en un budget unique, sans double comptage.
//
// - Les montants constatés sur les relevés font foi pour les catégories qu'ils couvrent.
// - Une ligne déclarée « absente des relevés » (espèces, loyer perçu, aide versée
//   sur un autre compte…) s'ajoute toujours.
// - Une ligne déclarée manuellement dans une catégorie couverte par les relevés
//   n'est pas comptée : elle devient le budget prévu pour cette catégorie, ce
//   qui permet de signaler un dépassement.

import type { BudgetEntry } from './budget.ts'
import { getCategory, type CategoryCode } from './categories.ts'
import { toMonthly, type Frequency } from './frequency.ts'
import type { Cents } from './money.ts'

export type EntrySource = 'manual' | 'off_statement'

export interface DeclaredEntry {
  id: string
  categoryCode: CategoryCode
  label: string | null
  amount: Cents
  frequency: Frequency
  source: EntrySource
}

export interface PlannedVsActual {
  categoryCode: CategoryCode
  /** Montant mensuel déclaré par l'utilisateur. */
  planned: Cents
  /** Montant mensuel moyen constaté sur les relevés. */
  actual: Cents
}

/** Origine d'un chiffre : constaté sur relevés, déclaré, ou les deux. */
export type FigureSource = 'statements' | 'declared' | 'mixed' | 'none'

export interface MergedBudget {
  entries: BudgetEntry[]
  /** Lignes déclarées non comptées car la catégorie est couverte par les relevés. */
  replacedEntryIds: string[]
  plannedVsActual: PlannedVsActual[]
  incomeSource: FigureSource
  expensesSource: FigureSource
}

function sourceOf(fromStatements: boolean, fromDeclared: boolean): FigureSource {
  if (fromStatements && fromDeclared) return 'mixed'
  if (fromStatements) return 'statements'
  if (fromDeclared) return 'declared'
  return 'none'
}

export function mergeBudgetSources(declared: readonly DeclaredEntry[], fromStatements: readonly BudgetEntry[]): MergedBudget {
  const observed = new Map<CategoryCode, Cents>()
  for (const e of fromStatements) if (e.amount > 0) observed.set(e.categoryCode, (observed.get(e.categoryCode) ?? 0) + toMonthly(e.amount, e.frequency))

  const entries: BudgetEntry[] = [...fromStatements]
  const replacedEntryIds: string[] = []
  const planned = new Map<CategoryCode, Cents>()
  let declaredIncome = false
  let declaredExpense = false

  for (const d of declared) {
    if (d.source === 'manual' && observed.has(d.categoryCode)) {
      replacedEntryIds.push(d.id)
      planned.set(d.categoryCode, (planned.get(d.categoryCode) ?? 0) + toMonthly(d.amount, d.frequency))
      continue
    }
    entries.push({ categoryCode: d.categoryCode, amount: d.amount, frequency: d.frequency })
    const kind = getCategory(d.categoryCode).kind
    if (kind === 'income') declaredIncome = true
    if (kind === 'expense') declaredExpense = true
  }

  const kindIn = (kind: string) => fromStatements.some((e) => e.amount > 0 && getCategory(e.categoryCode).kind === kind)

  return {
    entries,
    replacedEntryIds,
    plannedVsActual: [...planned.entries()].map(([categoryCode, p]) => ({ categoryCode, planned: p, actual: observed.get(categoryCode) ?? 0 })),
    incomeSource: sourceOf(kindIn('income'), declaredIncome),
    expensesSource: sourceOf(kindIn('expense'), declaredExpense),
  }
}
