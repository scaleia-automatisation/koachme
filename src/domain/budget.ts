// Résumé budgétaire mensuel, à partir de lignes déjà ramenées à une
// fréquence (montants déclarés ou moyennes constatées sur les relevés).
//
// Règles :
// - un remboursement reçu vient en déduction des dépenses, jamais en revenu ;
// - un mouvement interne (transfert) ou une opération à vérifier n'est jamais compté ;
// - l'épargne n'est ni un revenu ni une dépense.

import { getCategory, type CategoryCode, type ExpenseNature } from './categories'
import { toMonthly, type Frequency } from './frequency'
import { assertCents, type Cents } from './money'

export interface BudgetEntry {
  categoryCode: CategoryCode
  /** Montant positif, en centimes, pour la fréquence indiquée. */
  amount: Cents
  frequency: Frequency
}

export interface BudgetSummary {
  /** Revenus mensuels réguliers. */
  income: Cents
  /** Dépenses mensuelles (remboursements déduits, hors épargne). */
  expenses: Cents
  expensesByNature: Record<ExpenseNature, Cents>
  /** Remboursements reçus, déjà déduits des dépenses. */
  refunds: Cents
  /** Remboursements de crédits mensuels (inclus dans expenses). */
  debtRepayments: Cents
  /** Dépenses essentielles (logement, énergie, alimentation, santé…), incluses dans expenses. */
  essentialExpenses: Cents
  /** Épargne mensuelle identifiée ou déclarée. */
  savings: Cents
  /** Reste budgétaire estimé : revenus − dépenses − épargne. */
  balance: Cents
  /** Reste après charges fixes : revenus − charges fixes. */
  remainingAfterFixed: Cents
  /** Ratios rapportés aux revenus (null si aucun revenu). */
  savingsRate: number | null
  debtRatio: number | null
  fixedChargesRatio: number | null
  /** Montant mensuel par catégorie de revenu, dépense ou épargne, du plus élevé au plus faible. */
  byCategory: { categoryCode: CategoryCode; monthly: Cents }[]
}

export function summarizeBudget(entries: readonly BudgetEntry[]): BudgetSummary {
  const expensesByNature: Record<ExpenseNature, Cents> = { fixed: 0, variable: 0, reducible: 0 }
  const perCategory = new Map<CategoryCode, Cents>()
  let income = 0
  let savings = 0
  let refunds = 0
  let debtRepayments = 0
  let essentialExpenses = 0

  for (const entry of entries) {
    assertCents(entry.amount)
    if (entry.amount < 0) throw new Error(`Montant négatif refusé pour ${entry.categoryCode}`)
    const category = getCategory(entry.categoryCode)
    const monthly = toMonthly(entry.amount, entry.frequency)

    switch (category.kind) {
      case 'income':
        income += monthly
        break
      case 'savings':
        savings += monthly
        break
      case 'refund':
        refunds += monthly
        continue
      case 'transfer':
      case 'review':
        continue
      case 'expense':
        expensesByNature[category.nature ?? 'variable'] += monthly
        if (category.isDebt) debtRepayments += monthly
        if (category.isEssential) essentialExpenses += monthly
        break
    }
    perCategory.set(entry.categoryCode, (perCategory.get(entry.categoryCode) ?? 0) + monthly)
  }

  const grossExpenses = expensesByNature.fixed + expensesByNature.variable + expensesByNature.reducible
  const deducted = Math.min(refunds, grossExpenses)
  const expenses = grossExpenses - deducted
  const ratio = (value: Cents) => (income > 0 ? value / income : null)

  return {
    income,
    expenses,
    expensesByNature,
    refunds: deducted,
    debtRepayments,
    essentialExpenses,
    savings,
    balance: income - expenses - savings,
    remainingAfterFixed: income - expensesByNature.fixed,
    savingsRate: ratio(savings),
    debtRatio: ratio(debtRepayments),
    fixedChargesRatio: ratio(expensesByNature.fixed),
    byCategory: [...perCategory.entries()]
      .map(([categoryCode, monthly]) => ({ categoryCode, monthly }))
      .sort((a, b) => b.monthly - a.monthly),
  }
}
