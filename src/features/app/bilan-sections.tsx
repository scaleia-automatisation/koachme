// Sections de la page « Mon bilan ». Tous les chiffres proviennent de
// useAnalysis (moteur déterministe) ; ces composants ne font qu'afficher.
import { ArrowRight, CircleAlert, CircleCheck, CircleHelp, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/form-controls'
import {
  EXPENSE_NATURE_LABELS,
  findCategory,
  formatEuros,
  formatPercent,
  getGroup,
  type ConclusionLevel,
  type ExpenseNature,
  type Finding,
  type FigureSource,
  type MissingItem,
} from '@/domain'
import type { Analysis } from '@/features/finance/use-analysis'
import { cn } from '@/lib/utils'
import { formatDate, formatPeriod } from './import-meta'

const LEVEL_STYLE = {
  rouge: { dot: 'bg-danger', text: 'text-danger', soft: 'bg-danger-soft', border: 'border-danger/30' },
  orange: { dot: 'bg-warning', text: 'text-warning', soft: 'bg-warning-soft', border: 'border-warning/30' },
  vert: { dot: 'bg-success', text: 'text-success', soft: 'bg-success-soft', border: 'border-success/30' },
} as const

const NATURE_COLOR: Record<ExpenseNature, string> = { fixed: 'bg-primary', variable: 'bg-primary/50', reducible: 'bg-warning' }

const STEP_LINK: Record<MissingItem['step'], string> = {
  income: '/app/budget?etape=revenus',
  income_off_statement: '/app/budget?mode=hors-releves&etape=revenus',
  fixed: '/app/budget?etape=charges',
  variable: '/app/budget?etape=depenses',
  situation: '/app/budget?etape=situation',
  review: '/app/releves',
}

const SOURCE_LABEL: Record<FigureSource, string> = {
  statements: 'Constaté',
  declared: 'Déclaré',
  mixed: 'Constaté + déclaré',
  none: 'Non renseigné',
}

const months = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

export function FindingCard({ finding, primary = false }: { finding: Finding; primary?: boolean }) {
  const style = LEVEL_STYLE[finding.level]
  return (
    <div className={cn('rounded-xl border p-4 sm:p-5', style.border, primary ? style.soft : 'bg-surface')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', style.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn('font-semibold', primary && 'text-lg')}>{finding.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{finding.explanation}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm">
              <span className="text-muted-foreground">{finding.indicator.label} : </span>
              <span className="tabular font-semibold">{finding.indicator.value}</span>
            </p>
            <Link to={finding.action.to} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {finding.action.label}
              <ArrowRight className="size-3.5 shrink-0" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chiffres clés
// ---------------------------------------------------------------------------

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl bg-muted p-3 sm:p-4">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className={cn('tabular mt-1 font-semibold sm:text-lg', tone === 'danger' && 'text-danger')}>{value}</dd>
      {note && <dd className="mt-0.5 text-[0.6875rem] text-muted-foreground">{note}</dd>}
    </div>
  )
}

export function KeyFigures({ a }: { a: Analysis }) {
  const { summary, merged, figures, statementMonths } = a
  const period = figures.period
  const method =
    merged.incomeSource === 'statements' || merged.expensesSource === 'statements' || merged.incomeSource === 'mixed' || merged.expensesSource === 'mixed'
      ? `Moyennes mensuelles constatées${period ? ` ${formatPeriod(period.start, period.end)} (${months(statementMonths)})` : ''}, complétées par vos montants déclarés. Montants ponctuels ou annuels ramenés au mois ; opérations exceptionnelles, virements internes et opérations à vérifier exclus.`
      : 'Montants que vous avez déclarés, ramenés au mois (une dépense annuelle est divisée par 12).'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chiffres du mois</CardTitle>
        <CardDescription>{method}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Revenus réguliers" value={formatEuros(summary.income)} note={SOURCE_LABEL[merged.incomeSource]} />
          <Kpi label="Dépenses" value={formatEuros(summary.expenses)} note={SOURCE_LABEL[merged.expensesSource]} />
          <Kpi label="Épargne" value={formatEuros(summary.savings)} note={summary.savingsRate !== null ? `${formatPercent(summary.savingsRate, 1)} des revenus` : undefined} />
          <Kpi label="Reste budgétaire estimé" value={formatEuros(summary.balance)} note="Estimation mensuelle, pas un solde" tone={summary.balance < 0 ? 'danger' : undefined} />
        </dl>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {(Object.keys(EXPENSE_NATURE_LABELS) as ExpenseNature[]).map((n) => (
            <div key={n} className="flex justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <span className={cn('size-2 rounded-full', NATURE_COLOR[n])} aria-hidden />
                {n === 'variable' ? 'Dépenses variables' : EXPENSE_NATURE_LABELS[n]}
              </dt>
              <dd className="tabular font-medium">{formatEuros(summary.expensesByNature[n])}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Crédits et dettes (inclus)</dt>
            <dd className="tabular font-medium">{formatEuros(summary.debtRepayments)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Frais bancaires identifiés</dt>
            <dd className="tabular font-medium">{formatEuros(summary.byCategory.find((c) => c.categoryCode === 'frais_bancaires')?.monthly ?? 0)}</dd>
          </div>
          {summary.refunds > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Remboursements reçus (déduits)</dt>
              <dd className="tabular font-medium">−{formatEuros(summary.refunds)}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Soldes et engagements
// ---------------------------------------------------------------------------

export function AccountsPosition({ a }: { a: Analysis }) {
  const accounts = a.figures.accounts
  if (!accounts.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Soldes et engagements</CardTitle>
        <CardDescription>Le solde d’un compte n’est pas entièrement disponible : les prélèvements récurrents attendus avant votre prochain revenu sont déduits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.map((acc) => (
          <div key={acc.accountKey} className="rounded-xl border border-border p-4">
            <p className="font-medium">{acc.accountKey}</p>
            <p className="text-xs text-muted-foreground">{formatPeriod(acc.periodStart, acc.periodEnd)}</p>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Solde des opérations de la période</dt>
                <dd className="tabular font-medium">{formatEuros(acc.netFlow, { signed: true })}</dd>
              </div>
              {acc.closingBalance !== null ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Solde au {formatDate(acc.periodEnd)}</dt>
                    <dd className="tabular font-medium">{formatEuros(acc.closingBalance)}</dd>
                  </div>
                  {acc.pendingTotal !== 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Opérations en attente</dt>
                      <dd className="tabular font-medium">{formatEuros(acc.pendingTotal, { signed: true })}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Prélèvements connus avant le prochain revenu</dt>
                    <dd className="tabular font-medium">−{formatEuros(acc.upcomingCommitments)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-2">
                    <dt className="font-medium">Solde après engagements</dt>
                    <dd className={cn('tabular font-semibold', (acc.availableAfterCommitments ?? 0) < 0 && 'text-danger')}>{formatEuros(acc.availableAfterCommitments ?? 0)}</dd>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Solde final non indiqué sur le relevé : le solde disponible ne peut pas être estimé.</p>
              )}
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mouvements isolés
// ---------------------------------------------------------------------------

export function SeparatedMovements({ a }: { a: Analysis }) {
  const { figures } = a
  const rows: { label: string; value: string; detail: string; tone?: 'warning' }[] = []
  const excInc = figures.exceptionalIncome.reduce((s, t) => s + t.amount, 0)
  const excExp = figures.exceptionalExpenses.reduce((s, t) => s - t.amount, 0)
  if (figures.exceptionalIncome.length) rows.push({ label: 'Revenus exceptionnels', value: formatEuros(excInc), detail: figures.exceptionalIncome.map((t) => t.label).slice(0, 3).join(' · ') })
  if (figures.exceptionalExpenses.length) rows.push({ label: 'Dépenses exceptionnelles', value: formatEuros(excExp), detail: figures.exceptionalExpenses.map((t) => t.label).slice(0, 3).join(' · ') })
  if (figures.transfers.count) rows.push({ label: 'Virements entre vos comptes', value: formatEuros(figures.transfers.total), detail: `${figures.transfers.count} opérations, jamais comptées comme revenu ou dépense` })
  if (figures.toConfirm.count) rows.push({ label: 'Opérations à vérifier', value: formatEuros(figures.toConfirm.debits + figures.toConfirm.credits), detail: `${figures.toConfirm.count} opérations non comptées tant qu’elles ne sont pas classées`, tone: 'warning' })
  if (figures.pending.count) rows.push({ label: 'Opérations en attente', value: formatEuros(figures.pending.total, { signed: true }), detail: `${figures.pending.count} opérations non encore comptabilisées par la banque` })
  if (!rows.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mouvements mis à part</CardTitle>
        <CardDescription>Ces montants sont isolés pour ne pas fausser vos moyennes mensuelles. Ils portent sur toute la période des relevés.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{r.label}</p>
                <p className="truncate text-xs text-muted-foreground">{r.detail}</p>
              </div>
              <span className={cn('tabular shrink-0 font-semibold', r.tone === 'warning' && 'text-warning')}>{r.value}</span>
            </li>
          ))}
        </ul>
        {figures.toConfirm.count > 0 && (
          <Link to="/app/releves" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Classer les opérations à vérifier <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Répartition, évolution, récurrences, économies potentielles
// ---------------------------------------------------------------------------

export function SpendingByGroup({ a }: { a: Analysis }) {
  const groups = new Map<string, number>()
  for (const c of a.summary.byCategory) {
    const cat = findCategory(c.categoryCode)
    if (cat.kind !== 'expense') continue
    groups.set(cat.groupCode, (groups.get(cat.groupCode) ?? 0) + c.monthly)
  }
  const sorted = [...groups.entries()].sort((x, y) => y[1] - x[1])
  const max = sorted[0]?.[1] ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Où va votre argent</CardTitle>
        <CardDescription>Dépenses mensuelles par catégorie, remboursements non déduits.</CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length ? (
          <ul className="space-y-3">
            {sorted.map(([code, amount]) => (
              <li key={code}>
                <div className="flex justify-between gap-3 text-sm">
                  <span>{getGroup(code).label}</span>
                  <span className="tabular font-medium">{formatEuros(amount)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(amount / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune dépense pour l’instant.</p>
        )}
      </CardContent>
    </Card>
  )
}

export function Trends({ a }: { a: Analysis }) {
  // Seules les catégories présentes sur les deux mois sont comparées (une facture bimestrielle n’est pas une baisse de 100 %).
  const trends = a.trends.filter((t) => t.previous.amount > 0 && t.last.amount > 0 && Math.abs(t.change) >= 500).slice(0, 6)
  if (!trends.length) return null
  const [prev, last] = [trends[0].previous.month, trends[0].last.month]
  const label = (m: string) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${m}-01T00:00:00`))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Évolution des dépenses</CardTitle>
        <CardDescription>
          {label(prev)} → {label(last)}. Les mois incomplets sont ramenés à un mois complet avant comparaison.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {trends.map((t) => (
            <li key={t.categoryCode} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate">{findCategory(t.categoryCode).label}</span>
              <span className="tabular shrink-0 text-muted-foreground">
                {formatEuros(t.previous.amount)} → <span className="font-medium text-foreground">{formatEuros(t.last.amount)}</span>
                {t.last.coverage < 1 && <span className="ml-1 text-xs">(estimé)</span>}
              </span>
              <Badge tone={t.change > 0 ? 'warning' : 'success'} className="shrink-0">
                {t.ratio === null ? 'nouveau' : `${t.ratio > 0 ? '+' : ''}${formatPercent(t.ratio, 0)}`}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function RecurringList({ a }: { a: Analysis }) {
  const items = a.figures.recurring.filter((r) => r.direction < 0)
  if (!items.length) return null
  const total = items.reduce((s, r) => s + r.typicalAmount, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dépenses récurrentes</CardTitle>
        <CardDescription>
          {items.length} prélèvements reviennent chaque mois, pour environ {formatEuros(total)} au total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {items.slice(0, 10).map((r) => (
            <li key={r.merchantKey} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.merchantKey}</p>
                <p className="text-xs text-muted-foreground">
                  {findCategory(r.categoryCode).label} · vers le {r.typicalDay} du mois
                </p>
              </div>
              <span className="tabular shrink-0 font-medium">
                {formatEuros(r.typicalAmount)}
                {r.previousAmount !== null && r.lastAmount > r.previousAmount && (findCategory(r.categoryCode).nature === 'fixed' || findCategory(r.categoryCode).groupCode === 'abonnements') && (
                  <span className="ml-1 text-xs text-warning">en hausse</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function PotentialSavingsCard({ a }: { a: Analysis }) {
  const items = a.potential.filter((p) => p.potential > 0)
  if (!items.length) return null
  const monthly = items.reduce((s, p) => s + p.potential, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Économies potentielles</CardTitle>
        <CardDescription>
          Estimation, pas une économie réalisée : jusqu’à <span className="tabular font-semibold text-foreground">{formatEuros(monthly)}</span> par mois, soit{' '}
          <span className="tabular font-semibold text-foreground">{formatEuros(monthly * 12)}</span> par an, si vous réduisez ces postes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {items.slice(0, 6).map((p) => (
            <li key={p.categoryCode} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">{findCategory(p.categoryCode).label}</p>
                <p className="text-xs text-muted-foreground">
                  Aujourd’hui {formatEuros(p.current)} / mois. {p.hypothesis}.
                </p>
              </div>
              <span className="tabular shrink-0 font-semibold text-success">−{formatEuros(p.potential)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Fiabilité
// ---------------------------------------------------------------------------

const CONCLUSION_STYLE: Record<ConclusionLevel, { icon: ReactNode; label: string }> = {
  fiable: { icon: <CircleCheck className="size-4 text-success" aria-hidden />, label: 'Fiable' },
  estime: { icon: <CircleAlert className="size-4 text-warning" aria-hidden />, label: 'Estimé' },
  indisponible: { icon: <CircleHelp className="size-4 text-muted-foreground" aria-hidden />, label: 'Indisponible' },
}

export function ReliabilityCard({ a }: { a: Analysis }) {
  const { completeness } = a
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Fiabilité du diagnostic</CardTitle>
          <span className="tabular text-sm font-semibold">{completeness.score} / 100</span>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={completeness.score} label="Indicateur de complétude" tone={completeness.reliability === 'low' ? 'danger' : completeness.reliability === 'high' ? 'success' : 'primary'} />
        <ul className="mt-4 space-y-2 text-sm">
          {completeness.conclusions.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {CONCLUSION_STYLE[c.level].icon}
              <span>
                <span className="font-medium">{c.label}</span> — {CONCLUSION_STYLE[c.level].label.toLowerCase()}
                <span className="block text-xs text-muted-foreground">{c.reason}</span>
              </span>
            </li>
          ))}
        </ul>
        {completeness.missing.length > 0 && (
          <>
            <p className="mt-5 text-sm font-medium">Pour améliorer votre bilan</p>
            <ul className="mt-1 divide-y divide-border">
              {completeness.missing.map((m) => (
                <li key={m.key} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.impact}</p>
                  </div>
                  <Link to={STEP_LINK[m.step]} className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline" aria-label={`Compléter : ${m.label}`}>
                    Compléter <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Aucun montant manquant n’est inventé : les informations absentes sont signalées et le bilan s’améliore dès que vous les ajoutez, sans recommencer.
        </p>
      </CardContent>
    </Card>
  )
}
