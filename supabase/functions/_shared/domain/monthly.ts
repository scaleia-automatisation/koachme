// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Historique mensuel constaté sur les relevés : revenus, dépenses, reste,
// catégories et frais, mois calendaire par mois calendaire. Un mois
// partiellement couvert est signalé et ramené à un mois complet avant toute
// comparaison (jamais comparé brut).

import { getCategory, type CategoryCode } from './categories.ts'
import type { Cents } from './money.ts'
import { monthCoverage, type AnalyzedTransaction, type ImportInfo } from './statements.ts'

export interface MonthFigures {
  /** « AAAA-MM ». */
  month: string
  /** Part du mois couverte par les relevés (1 = mois complet). */
  coverage: number
  income: Cents
  /** Dépenses réelles, remboursements déduits. */
  expenses: Cents
  savings: Cents
  balance: Cents
  fees: Cents
  exceptionalIncome: Cents
  exceptionalExpenses: Cents
  byCategory: Record<CategoryCode, Cents>
}

const monthOf = (iso: string) => iso.slice(0, 7)

/** Chiffres constatés par mois (montants réels, non extrapolés). */
export function monthlyHistory(transactions: readonly AnalyzedTransaction[], imports: readonly ImportInfo[]): MonthFigures[] {
  // Couverture : pour chaque mois, la meilleure couverture parmi les comptes (le compte principal fait foi).
  const coverage = new Map<string, number>()
  const byAccount = new Map<string, { start: string; end: string }[]>()
  for (const imp of imports) {
    if (!imp.periodStart || !imp.periodEnd) continue
    byAccount.set(imp.accountKey, [...(byAccount.get(imp.accountKey) ?? []), { start: imp.periodStart, end: imp.periodEnd }])
  }
  for (const periods of byAccount.values()) {
    for (const [m, c] of monthCoverage(periods)) coverage.set(m, Math.max(coverage.get(m) ?? 0, c))
  }

  const months = new Map<string, MonthFigures>()
  const get = (m: string) => {
    let f = months.get(m)
    if (!f) {
      f = { month: m, coverage: Math.min(1, coverage.get(m) ?? 1), income: 0, expenses: 0, savings: 0, balance: 0, fees: 0, exceptionalIncome: 0, exceptionalExpenses: 0, byCategory: {} }
      months.set(m, f)
    }
    return f
  }

  for (const tx of transactions) {
    if (tx.excluded || tx.isPending) continue
    const f = get(monthOf(tx.opDate))
    switch (tx.treatment) {
      case 'income':
        if (tx.exceptional) f.exceptionalIncome += tx.amount
        else f.income += tx.amount
        break
      case 'expense':
        if (tx.exceptional) {
          f.exceptionalExpenses -= tx.amount
          break
        }
        f.expenses -= tx.amount
        f.byCategory[tx.categoryCode] = (f.byCategory[tx.categoryCode] ?? 0) - tx.amount
        if (tx.categoryCode === 'frais_bancaires') f.fees -= tx.amount
        break
      case 'refund':
        f.expenses -= tx.amount
        break
      case 'savings':
        f.savings -= tx.amount
        break
    }
  }

  for (const f of months.values()) {
    f.expenses = Math.max(0, f.expenses)
    f.balance = f.income - f.expenses - f.savings
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/** Ramène les chiffres d'un mois partiel à un mois complet (estimation). */
export function normalizeMonth(f: MonthFigures): MonthFigures {
  if (f.coverage >= 0.999) return f
  const k = 1 / Math.max(f.coverage, 0.01)
  const scale = (c: Cents) => Math.round(c * k)
  return {
    ...f,
    income: scale(f.income),
    expenses: scale(f.expenses),
    savings: scale(f.savings),
    balance: scale(f.balance),
    fees: scale(f.fees),
    byCategory: Object.fromEntries(Object.entries(f.byCategory).map(([c, v]) => [c, scale(v)])),
  }
}

export interface MonthChange {
  categoryCode: CategoryCode
  previous: Cents
  current: Cents
  change: Cents
  ratio: number | null
}

/**
 * Hausses et baisses importantes entre deux mois, après normalisation des
 * mois partiels. Seules les catégories de dépenses présentes sur les deux
 * mois et dont l'écart dépasse le seuil sont retenues.
 */
export function compareMonths(previous: MonthFigures, current: MonthFigures, minChange = 2000, minRatio = 0.2): MonthChange[] {
  const p = normalizeMonth(previous)
  const c = normalizeMonth(current)
  const codes = new Set([...Object.keys(p.byCategory), ...Object.keys(c.byCategory)])
  const changes: MonthChange[] = []
  for (const code of codes) {
    if (getCategory(code).kind !== 'expense') continue
    const before = p.byCategory[code] ?? 0
    const after = c.byCategory[code] ?? 0
    if (!before || !after) continue
    const change = after - before
    const ratio = change / before
    if (Math.abs(change) >= minChange && Math.abs(ratio) >= minRatio) changes.push({ categoryCode: code, previous: before, current: after, change, ratio })
  }
  return changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}
