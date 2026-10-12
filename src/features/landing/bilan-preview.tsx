// Aperçu d'un bilan calculé en direct par le moteur de calcul sur un budget
// d'exemple. Clairement présenté comme une illustration, jamais comme des
// données d'utilisateur.
import { Lightbulb } from 'lucide-react'
import { StatusBadge } from '@/components/feedback/status-badge'
import { Card } from '@/components/ui/card'
import {
  diagnose,
  EXPENSE_NATURE_LABELS,
  formatEuros,
  formatPercent,
  getCategory,
  summarizeBudget,
  type BudgetEntry,
  type ExpenseNature,
} from '@/domain'

const EXAMPLE: BudgetEntry[] = [
  { categoryCode: 'salaire', amount: 240000, frequency: 'monthly' },
  { categoryCode: 'logement', amount: 85000, frequency: 'monthly' },
  { categoryCode: 'energie_eau', amount: 11000, frequency: 'monthly' },
  { categoryCode: 'assurances', amount: 72000, frequency: 'yearly' },
  { categoryCode: 'telecom', amount: 4500, frequency: 'monthly' },
  { categoryCode: 'alimentation', amount: 42000, frequency: 'monthly' },
  { categoryCode: 'transport', amount: 15000, frequency: 'monthly' },
  { categoryCode: 'abonnements', amount: 6800, frequency: 'monthly' },
  { categoryCode: 'restaurants_livraisons', amount: 18000, frequency: 'monthly' },
  { categoryCode: 'epargne', amount: 10000, frequency: 'monthly' },
]

const NATURE_BAR: Record<ExpenseNature, string> = {
  fixed: 'bg-primary',
  variable: 'bg-primary/55',
  reducible: 'bg-warning',
}

export function BilanPreview() {
  const summary = summarizeBudget(EXAMPLE)
  const health = diagnose({ summary, figures: null, plannedVsActual: [], situation: null, goals: [] })
  const topReducible = summary.byCategory.find((c) => getCategory(c.categoryCode).nature === 'reducible')
  const natures = Object.keys(EXPENSE_NATURE_LABELS) as ExpenseNature[]

  return (
    <Card className="w-full max-w-md p-5 shadow-raised sm:p-6" aria-label="Exemple illustratif de bilan">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exemple de bilan</p>
        <StatusBadge status={health.status} />
      </div>

      <div className="mt-5">
        <p className="text-sm text-muted-foreground">Reste disponible ce mois-ci</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatEuros(summary.balance)}</p>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-border py-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Revenus</dt>
          <dd className="tabular mt-0.5 font-semibold">{formatEuros(summary.income)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dépenses</dt>
          <dd className="tabular mt-0.5 font-semibold">{formatEuros(summary.expenses)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Épargne</dt>
          <dd className="tabular mt-0.5 font-semibold">{formatPercent(summary.savingsRate ?? 0)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Répartition des dépenses">
          {natures.map((n) => (
            <div key={n} className={NATURE_BAR[n]} style={{ width: `${(summary.expensesByNature[n] / summary.expenses) * 100}%` }} />
          ))}
        </div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {natures.map((n) => (
            <li key={n} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className={`size-2 rounded-full ${NATURE_BAR[n]}`} aria-hidden />
                {EXPENSE_NATURE_LABELS[n]}
              </span>
              <span className="tabular font-medium">{formatEuros(summary.expensesByNature[n])}</span>
            </li>
          ))}
        </ul>
      </div>

      {topReducible && (
        <div className="mt-5 flex gap-3 rounded-lg bg-primary-soft p-3 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">{getCategory(topReducible.categoryCode).label}</span> :{' '}
            {formatEuros(topReducible.monthly)} par mois. Les réduire de moitié libérerait{' '}
            <span className="tabular font-semibold">{formatEuros(Math.round(topReducible.monthly * 6))}</span> par an.
          </p>
        </div>
      )}
    </Card>
  )
}
