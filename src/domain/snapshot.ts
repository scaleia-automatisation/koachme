// Instantané mensuel du bilan : conservé chaque mois pour l'historique
// (« Ma progression ») et le bilan mensuel imprimable. Il fige les chiffres
// calculés par le moteur à une date donnée, y compris les données déclarées
// (dettes, objectifs) qui n'ont pas d'historique ailleurs.

import type { AnalysisResult } from './analysis'
import { findCategory, getGroup } from './categories'
import type { FinancialSituation } from './completeness'
import type { Cents } from './money'
import type { FigureSource } from './sources'
import type { FinancialStatus } from './status'

export interface MonthlySnapshot {
  version: 1
  period: string
  generatedAt: string
  status: FinancialStatus
  headline: string
  completenessScore: number
  income: Cents
  expenses: Cents
  savings: Cents
  balance: Cents
  savingsRate: number | null
  fees: Cents
  potentialMonthly: Cents
  confirmedSavingsMonthly: Cents
  debtRepayments: Cents
  debtRemaining: Cents | null
  byGroup: { code: string; label: string; amount: Cents }[]
  goals: { name: string; target: Cents; current: Cents; reached: boolean }[]
  keyPoints: string[]
  priorities: string[]
  sources: { income: FigureSource; expenses: FigureSource; statementPeriod: { start: string; end: string } | null }
}

export function buildSnapshot(
  a: Pick<AnalysisResult, 'summary' | 'diagnosis' | 'completeness' | 'potential' | 'confirmedSavings' | 'goals' | 'keyPoints' | 'priorities' | 'merged' | 'figures'>,
  situation: FinancialSituation | null, period: string, generatedAt: string): MonthlySnapshot {
  const groups = new Map<string, number>()
  for (const c of a.summary.byCategory) {
    const cat = findCategory(c.categoryCode)
    if (cat.kind === 'expense') groups.set(cat.groupCode, (groups.get(cat.groupCode) ?? 0) + c.monthly)
  }
  return {
    version: 1,
    period,
    generatedAt,
    status: a.diagnosis.status,
    headline: a.diagnosis.headline.title,
    completenessScore: a.completeness.score,
    income: a.summary.income,
    expenses: a.summary.expenses,
    savings: a.summary.savings,
    balance: a.summary.balance,
    savingsRate: a.summary.savingsRate,
    fees: a.summary.byCategory.find((c) => c.categoryCode === 'frais_bancaires')?.monthly ?? 0,
    potentialMonthly: a.potential.reduce((s, p) => s + p.potential, 0),
    confirmedSavingsMonthly: a.confirmedSavings,
    debtRepayments: a.summary.debtRepayments,
    debtRemaining: situation?.debtRemaining ?? null,
    byGroup: [...groups.entries()].sort((x, y) => y[1] - x[1]).map(([code, amount]) => ({ code, label: getGroup(code).label, amount })),
    goals: a.goals.map((g) => ({ name: g.goal.name, target: g.goal.targetAmount, current: g.current, reached: g.reached })),
    keyPoints: a.keyPoints.map((k) => k.text),
    priorities: a.priorities.map((p) => p.title),
    sources: { income: a.merged.incomeSource, expenses: a.merged.expensesSource, statementPeriod: a.figures.period },
  }
}

/** Période « AAAA-MM » d'une date ISO. */
export function periodOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}
