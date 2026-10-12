// « Ma progression » : historique mois par mois. Deux sources :
// - les chiffres constatés sur les relevés (mois partiels signalés et ramenés
//   à un mois complet avant toute comparaison) ;
// - les bilans mensuels enregistrés (instantanés), qui conservent aussi les
//   données déclarées : dettes, objectifs, économies confirmées.
import { FileText, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status-badge'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { compareMonths, findCategory, formatEuros, normalizeMonth } from '@/domain'
import { useMonthlyReports } from '@/features/finance/api'
import { useAnalysis } from '@/features/finance/use-analysis'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { monthLabel } from './import-meta'
import { useFeature } from '@/features/finance/use-entitlement'
import { UpgradeCard } from './premium'

export function ProgressPage() {
  useDocumentTitle('Ma progression')
  const analysis = useAnalysis()
  const reports = useMonthlyReports()
  const historyFeature = useFeature('monthly_history')
  const historyAllowed = historyFeature === true
  const comparisonsAllowed = useFeature('detailed_comparisons') === true

  if (analysis.isLoading || reports.isLoading) return <LoadingState className="py-24" />
  if (analysis.error || !analysis.data || reports.error) return <ErrorState onRetry={analysis.refetch} className="py-24" />

  const a = analysis.data
  const snapshots = reports.data ?? []
  const history = a.history.map(normalizeMonth)
  const fromStatements = history.length > 0

  const chart = fromStatements
    ? a.history.map((m) => {
        const n = normalizeMonth(m)
        return {
          mois: monthLabel(m.month, 'short') + (m.coverage < 0.999 ? '*' : ''),
          revenus: n.income / 100,
          depenses: n.expenses / 100,
          reste: n.balance / 100,
        }
      })
    : snapshots.map((s) => ({
        mois: monthLabel(s.period, 'short'),
        revenus: s.snapshot.income / 100,
        depenses: s.snapshot.expenses / 100,
        reste: s.snapshot.balance / 100,
      }))

  // Catégories sur les derniers mois (relevés, normalisés).
  const lastMonths = history.slice(-4)
  const categoryCodes = [...new Set(lastMonths.flatMap((m) => Object.keys(m.byCategory)))]
    .map((code) => ({
      code,
      total: lastMonths.reduce((s, m) => s + (m.byCategory[code] ?? 0), 0),
    }))
    .sort((x, y) => y.total - x.total)
    .slice(0, 10)
  const comparable = a.history.filter((m) => m.coverage >= 0.5)
  const changes = comparable.length >= 2 ? compareMonths(comparable.at(-2)!, comparable.at(-1)!) : []
  const previous = snapshots.at(-2)

  if (!fromStatements && snapshots.length === 0) {
    return (
      <Container className="max-w-2xl py-12">
        <Card>
          <EmptyState
            icon={TrendingUp}
            title="Votre progression apparaîtra ici"
            description="Chaque mois, votre bilan est enregistré automatiquement. Importez des relevés pour comparer aussi vos dépenses mois par mois."
            action={
              <Button asChild>
                <Link to="/app/releves">Importer un relevé</Link>
              </Button>
            }
          />
        </Card>
      </Container>
    )
  }

  return (
    <Container className="space-y-6 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ma progression</h1>
        <p className="mt-1 text-sm text-muted-foreground">Votre situation mois après mois. Les économies affichées comme confirmées sont uniquement celles que vous avez déclarées.</p>
      </div>

      {historyFeature === false && (
        <UpgradeCard title="Historique et comparaisons détaillées avec Premium">
          Retrouvez vos bilans mensuels enregistrés, l’évolution de chaque catégorie de dépenses et les hausses ou baisses importantes d’un mois à l’autre.
        </UpgradeCard>
      )}

      {previous && historyAllowed && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Résultats de {monthLabel(previous.period)}</p>
            <p className="mt-1 font-semibold">
              Reste estimé {formatEuros(previous.snapshot.balance)} · dépenses {formatEuros(previous.snapshot.expenses)}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/app/progression/${previous.period}`}>
              <FileText aria-hidden /> Voir le bilan du mois
            </Link>
          </Button>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Revenus, dépenses et reste</CardTitle>
          <CardDescription>
            {fromStatements ? 'Constaté sur vos relevés, par mois calendaire. * mois partiel ramené à un mois complet (estimation).' : 'D’après vos bilans mensuels enregistrés (montants déclarés).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64" role="img" aria-label={`Évolution mensuelle : ${chart.map((r) => `${r.mois} revenus ${Math.round(r.revenus)} €, dépenses ${Math.round(r.depenses)} €`).join(' ; ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="mois" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={60} tickFormatter={(v: number) => `${Math.round(v)} €`} />
                <Tooltip formatter={(v) => formatEuros(Math.round(Number(v) * 100))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenus" name="Revenus" stroke="var(--color-success)" strokeWidth={2} dot />
                <Line type="monotone" dataKey="depenses" name="Dépenses" stroke="var(--color-primary)" strokeWidth={2} dot />
                <Line type="monotone" dataKey="reste" name="Reste" stroke="var(--color-warning)" strokeWidth={2} strokeDasharray="4 3" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {fromStatements && categoryCodes.length > 0 && comparisonsAllowed && (
        <Card>
          <CardHeader>
            <CardTitle>Dépenses par catégorie</CardTitle>
            <CardDescription>Derniers mois couverts par vos relevés, ramenés à un mois complet.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto" tabIndex={0} role="region" aria-label="Dépenses par catégorie">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Catégorie</th>
                  {lastMonths.map((m) => (
                    <th key={m.month} className="py-2 text-right font-medium">
                      {monthLabel(m.month, 'short')}
                      {m.coverage < 0.999 && '*'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryCodes.map(({ code }) => (
                  <tr key={code}>
                    <td className="py-2">{findCategory(code).label}</td>
                    {lastMonths.map((m) => (
                      <td key={m.month} className="tabular py-2 text-right">
                        {m.byCategory[code] ? formatEuros(m.byCategory[code]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">Frais bancaires identifiés</td>
                  {lastMonths.map((m) => (
                    <td key={m.month} className="tabular py-2 text-right">
                      {formatEuros(m.fees)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            {changes.length > 0 && (
              <div className="mt-4 space-y-1 text-sm">
                <p className="font-medium">Hausses et baisses importantes</p>
                {changes.map((c) => (
                  <p key={c.categoryCode} className={cn('tabular', c.change > 0 ? 'text-warning' : 'text-success')}>
                    {findCategory(c.categoryCode).label} : {formatEuros(c.previous)} → {formatEuros(c.current)} ({c.change > 0 ? '+' : ''}
                    {Math.round((c.ratio ?? 0) * 100)} %)
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {snapshots.length > 0 && historyAllowed && (
        <Card>
          <CardHeader>
            <CardTitle>Bilans mensuels</CardTitle>
            <CardDescription>Enregistrés automatiquement à chaque consultation de votre bilan, puis figés à la fin du mois.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bilans mensuels">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Mois</th>
                  <th className="py-2 font-medium">Statut</th>
                  <th className="py-2 text-right font-medium">Revenus</th>
                  <th className="py-2 text-right font-medium">Dépenses</th>
                  <th className="py-2 text-right font-medium">Reste</th>
                  <th className="py-2 text-right font-medium">Frais</th>
                  <th className="py-2 text-right font-medium">Éco. potentielles</th>
                  <th className="py-2 text-right font-medium">Éco. confirmées</th>
                  <th className="py-2 text-right font-medium">Dettes restantes</th>
                  <th className="py-2 text-right font-medium">Objectifs</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...snapshots].reverse().map(({ period, snapshot: s }) => {
                  const goalsCurrent = s.goals.reduce((x, g) => x + g.current, 0)
                  const goalsTarget = s.goals.reduce((x, g) => x + g.target, 0)
                  return (
                    <tr key={period}>
                      <td className="py-2 font-medium capitalize">{monthLabel(period)}</td>
                      <td className="py-2">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="tabular py-2 text-right">{formatEuros(s.income)}</td>
                      <td className="tabular py-2 text-right">{formatEuros(s.expenses)}</td>
                      <td className={cn('tabular py-2 text-right', s.balance < 0 && 'text-danger')}>{formatEuros(s.balance)}</td>
                      <td className="tabular py-2 text-right">{formatEuros(s.fees)}</td>
                      <td className="tabular py-2 text-right text-muted-foreground">{formatEuros(s.potentialMonthly)}</td>
                      <td className="tabular py-2 text-right text-success">{formatEuros(s.confirmedSavingsMonthly)}</td>
                      <td className="tabular py-2 text-right">{s.debtRemaining === null ? '—' : formatEuros(s.debtRemaining)}</td>
                      <td className="tabular py-2 text-right">{goalsTarget ? `${formatEuros(goalsCurrent)} / ${formatEuros(goalsTarget)}` : '—'}</td>
                      <td className="py-2 text-right">
                        <Link to={`/app/progression/${period}`} className="text-sm font-medium text-primary hover:underline">
                          Bilan
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Container>
  )
}
