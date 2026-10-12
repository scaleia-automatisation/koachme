// « Mes dépenses » : les faits, sans jugement. Aucune dépense n'est qualifiée
// automatiquement de superflue : quand l'utilité d'un paiement récurrent est
// inconnue, la question est posée à l'utilisateur.
import { AlertTriangle, ArrowRight, Landmark, Repeat, X } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import {
  allCategories,
  allGroups,
  compareMonths,
  EXPENSE_NATURE_LABELS,
  findCategory,
  formatEuros,
  formatPercent,
  getGroup,
  normalizeMonth,
  type AnalyzedTransaction,
  type ExpenseNature,
  type SubscriptionVerdict,
} from '@/domain'
import { useSetSubscriptionVerdict, useSubscriptionReviews } from '@/features/finance/api'
import { isImportCounted } from '@/domain'
import { useAnalysis, toImportRecord, type Analysis } from '@/features/finance/use-analysis'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { formatDate } from './import-meta'
import { useFeature } from '@/features/finance/use-entitlement'
import { UpgradeCard } from './premium'

type Status = 'all' | 'to_review' | 'auto' | 'confirmed' | 'corrected'
const STATUS_LABELS: Record<Status, string> = {
  all: 'Tous les statuts',
  to_review: 'À vérifier',
  auto: 'Classement automatique',
  confirmed: 'Vérifiées',
  corrected: 'Corrigées',
}
const NATURE_FILL: Record<ExpenseNature, string> = {
  fixed: 'var(--color-primary)',
  variable: 'color-mix(in oklch, var(--color-primary) 50%, white)',
  reducible: 'var(--color-warning)',
}
const monthLabel = (m: string, style: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('fr-FR', {
    month: style,
    year: style === 'long' ? 'numeric' : '2-digit',
  }).format(new Date(`${m}-01T00:00:00`))

function matchesStatus(t: AnalyzedTransaction, status: Status) {
  switch (status) {
    case 'all':
      return true
    case 'to_review':
      return t.needsReview || t.treatment === 'review'
    default:
      return t.reviewStatus === status && !t.needsReview
  }
}

const VERDICT_LABELS: Record<SubscriptionVerdict, string> = {
  useful: 'Utile',
  to_cancel: 'À résilier',
  cancelled: 'Résilié',
}

function RecurringPayments({ a }: { a: Analysis }) {
  const verdicts = useSubscriptionReviews()
  const setVerdict = useSetSubscriptionVerdict()
  const items = a.figures.recurring.filter((r) => r.direction < 0)
  const total = items.reduce((s, r) => s + r.typicalAmount, 0)
  return (
    <Card id="recurrents" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-primary" aria-hidden /> Abonnements et paiements récurrents
        </CardTitle>
        <CardDescription>
          {items.length
            ? `${items.length} paiements identifiés, environ ${formatEuros(total)} par mois. Indiquez ceux qui vous sont utiles : seuls ceux que vous marquez « à résilier » comptent comme économie possible.`
            : 'Aucun paiement récurrent identifié : il faut au moins deux mois de relevés.'}
        </CardDescription>
      </CardHeader>
      {items.length > 0 && (
        <CardContent>
          <ul className="divide-y divide-border">
            {items.map((r) => {
              const verdict = verdicts.data?.get(r.merchantKey) ?? null
              const isSubscription = findCategory(r.categoryCode).groupCode === 'abonnements'
              return (
                <li key={r.merchantKey} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.merchantKey}</p>
                    <p className="text-xs text-muted-foreground">
                      {findCategory(r.categoryCode).label} · vers le {r.typicalDay} du mois · {r.occurrences} fois
                      {r.previousAmount !== null && r.lastAmount !== r.previousAmount && ` · ${formatEuros(r.previousAmount)} → ${formatEuros(r.lastAmount)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular mr-1 font-semibold">{formatEuros(r.typicalAmount)}</span>
                    {isSubscription &&
                      (verdict ? (
                        <>
                          <Badge tone={verdict === 'useful' ? 'success' : verdict === 'cancelled' ? 'neutral' : 'warning'}>{VERDICT_LABELS[verdict]}</Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label={`Modifier l’avis sur ${r.merchantKey}`}
                            onClick={() =>
                              setVerdict.mutate({
                                merchantKey: r.merchantKey,
                                verdict: null,
                              })
                            }
                          >
                            <X />
                          </Button>
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          Toujours utile ?
                          {(['useful', 'to_cancel', 'cancelled'] as const).map((v) => (
                            <Button
                              key={v}
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-xs"
                              disabled={setVerdict.isPending}
                              onClick={() =>
                                setVerdict.mutate({
                                  merchantKey: r.merchantKey,
                                  verdict: v,
                                })
                              }
                            >
                              {v === 'useful' ? 'Oui' : v === 'to_cancel' ? 'À résilier' : 'Déjà résilié'}
                            </Button>
                          ))}
                        </span>
                      ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}

export function ExpensesPage() {
  useDocumentTitle('Mes dépenses')
  const comparisons = useFeature('detailed_comparisons')
  const analysis = useAnalysis()
  const [params, setParams] = useSearchParams()
  const month = params.get('mois') ?? 'all'
  const category = params.get('categorie') ?? 'all'
  const account = params.get('compte') ?? 'all'
  const status = (params.get('statut') as Status) ?? 'all'
  const nature = (params.get('nature') as ExpenseNature | null) ?? null

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value === 'all' || !value) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const a = analysis.data
  const counted = useMemo(() => {
    if (!a) return []
    const ids = new Set(a.imports.filter((i) => isImportCounted(toImportRecord(i))).map((i) => i.id))
    return a.analyzed.filter((t) => ids.has(t.importId))
  }, [a])

  const expenses = useMemo(
    () =>
      counted.filter((t) => {
        if (t.excluded || t.isPending || t.amount >= 0) return false
        if (t.treatment !== 'expense' && t.treatment !== 'review') return false
        const cat = findCategory(t.categoryCode)
        if (category !== 'all' && t.categoryCode !== category && cat.groupCode !== category) return false
        if (nature && cat.nature !== nature) return false
        if (account !== 'all' && t.accountKey !== account) return false
        return matchesStatus(t, status)
      }),
    [counted, category, nature, account, status],
  )
  const inPeriod = month === 'all' ? expenses : expenses.filter((t) => t.opDate.startsWith(month))

  if (analysis.isLoading) return <LoadingState className="py-24" />
  if (analysis.error || !a) return <ErrorState onRetry={analysis.refetch} className="py-24" />

  const hasStatements = counted.length > 0
  const months = [...new Set(counted.map((t) => t.opDate.slice(0, 7)))].sort()
  const accounts = [...new Set(counted.map((t) => t.accountKey))]
  const coverage = new Map(a.history.map((m) => [m.month, m.coverage]))

  // Graphique : dépenses par mois et par nature, pour les filtres choisis (hors période).
  const chart = months.map((m) => {
    const row: Record<string, number | string> = {
      mois: monthLabel(m) + ((coverage.get(m) ?? 1) < 0.999 ? '*' : ''),
      fixed: 0,
      variable: 0,
      reducible: 0,
    }
    for (const t of expenses) {
      if (!t.opDate.startsWith(m)) continue
      const n = findCategory(t.categoryCode).nature ?? 'variable'
      row[n] = (row[n] as number) - t.amount / 100
    }
    return row
  })

  const total = inPeriod.reduce((s, t) => s - t.amount, 0)
  const byNature = { fixed: 0, variable: 0, reducible: 0 } as Record<ExpenseNature, number>
  const byGroup = new Map<string, number>()
  for (const t of inPeriod) {
    const cat = findCategory(t.categoryCode)
    if (cat.nature) byNature[cat.nature] -= t.amount
    byGroup.set(cat.groupCode, (byGroup.get(cat.groupCode) ?? 0) - t.amount)
  }
  const groups = [...byGroup.entries()].sort((x, y) => y[1] - x[1])
  const top = [...inPeriod].sort((x, y) => x.amount - y.amount).slice(0, 10)
  const fees = inPeriod.filter((t) => t.categoryCode === 'frais_bancaires')
  const toReview = counted.filter((t) => !t.excluded && (t.needsReview || t.treatment === 'review'))

  const comparable = a.history.filter((m) => m.coverage >= 0.5)
  const changes = comparable.length >= 2 ? compareMonths(comparable.at(-2)!, comparable.at(-1)!) : []
  const increases = a.diagnosis.findings.filter((f) => f.code === 'charge_increase' || f.code === 'category_increase' || f.code === 'budget_overrun')

  return (
    <Container className="space-y-6 py-8 sm:py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes dépenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">Les faits, issus de vos relevés. Montants réels, sans jugement.</p>
      </div>

      {!hasStatements ? (
        <Card>
          <EmptyState
            icon={Landmark}
            title="Importez un relevé pour voir le détail de vos dépenses"
            description="Avec vos montants déclarés, nous connaissons vos grandes catégories. Le détail, les graphiques mensuels et les paiements récurrents nécessitent un relevé bancaire."
            action={
              <Button asChild>
                <Link to="/app/releves">Importer un relevé</Link>
              </Button>
            }
          />
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {a.summary.byCategory
                .filter((c) => findCategory(c.categoryCode).kind === 'expense')
                .map((c) => (
                  <li key={c.categoryCode} className="flex justify-between py-2">
                    <span>{findCategory(c.categoryCode).label}</span>
                    <span className="tabular font-medium">{formatEuros(c.monthly)} / mois (déclaré)</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filtres */}
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select aria-label="Période" value={month} onChange={(e) => setFilter('mois', e.target.value)}>
              <option value="all">Toute la période</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m, 'long')}
                  {(coverage.get(m) ?? 1) < 0.999 ? ' (partiel)' : ''}
                </option>
              ))}
            </Select>
            <Select aria-label="Catégorie" value={category} onChange={(e) => setFilter('categorie', e.target.value)}>
              <option value="all">Toutes les catégories</option>
              {allGroups().map((g) => {
                const cats = allCategories().filter((c) => c.groupCode === g.code && (c.kind === 'expense' || c.kind === 'review'))
                if (!cats.length) return null
                return (
                  <optgroup key={g.code} label={g.label}>
                    {cats.length > 1 && <option value={g.code}>{g.label} (tout)</option>}
                    {cats.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </Select>
            <Select aria-label="Compte" value={account} onChange={(e) => setFilter('compte', e.target.value)}>
              <option value="all">Tous les comptes</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </Select>
            <Select aria-label="Statut de vérification" value={status} onChange={(e) => setFilter('statut', e.target.value)}>
              {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            {nature && (
              <button onClick={() => setFilter('nature', '')} className="flex items-center gap-1 text-sm text-primary sm:col-span-2 lg:col-span-4">
                Filtre : {EXPENSE_NATURE_LABELS[nature]} <X className="size-3.5" aria-hidden />
              </button>
            )}
          </Card>

          {/* Chiffres de la sélection */}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Total des dépenses', formatEuros(total)],
              ['Charges fixes', formatEuros(byNature.fixed)],
              ['Dépenses variables', formatEuros(byNature.variable + byNature.reducible)],
              ['Opérations', String(inPeriod.length)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="tabular mt-1 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Dépenses mensuelles</CardTitle>
                <CardDescription>Montants réels par mois. * mois partiellement couvert par vos relevés : ne le comparez pas directement à un mois complet.</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Graphique des dépenses mensuelles : ${chart.map((r) => `${r.mois} ${formatEuros(Math.round(((r.fixed as number) + (r.variable as number) + (r.reducible as number)) * 100))}`).join(', ')}`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="mois" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v: number) => `${Math.round(v)} €`} />
                      <Tooltip formatter={(v) => formatEuros(Math.round(Number(v) * 100))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {(Object.keys(EXPENSE_NATURE_LABELS) as ExpenseNature[]).map((n) => (
                        <Bar key={n} dataKey={n} name={EXPENSE_NATURE_LABELS[n]} stackId="a" fill={NATURE_FILL[n]} radius={n === 'reducible' ? [4, 4, 0, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Répartition par catégorie</CardTitle>
                <CardDescription>{month === 'all' ? 'Sur toute la période' : monthLabel(month, 'long')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {groups.map(([code, amount]) => (
                    <li key={code}>
                      <button onClick={() => setFilter('categorie', code)} className="w-full text-left">
                        <div className="flex justify-between gap-3 text-sm">
                          <span>{getGroup(code).label}</span>
                          <span className="tabular font-medium">
                            {formatEuros(amount)} <span className="text-xs text-muted-foreground">{total ? formatPercent(amount / total) : ''}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{
                              width: `${total ? (amount / total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </button>
                    </li>
                  ))}
                  {!groups.length && <p className="text-sm text-muted-foreground">Aucune dépense pour cette sélection.</p>}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Principales dépenses</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {top.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(t.opDate)} · {findCategory(t.categoryCode).label}
                          {t.exceptional && ' · exceptionnelle'}
                        </p>
                      </div>
                      <span className="tabular shrink-0 font-semibold">{formatEuros(-t.amount)}</span>
                    </li>
                  ))}
                  {!top.length && <p className="py-2 text-muted-foreground">Aucune dépense pour cette sélection.</p>}
                </ul>
              </CardContent>
            </Card>

            {comparisons === false ? (
              <UpgradeCard title="Comparaisons détaillées avec Premium">Comparez vos dépenses mois par mois et repérez les hausses ou baisses inhabituelles par catégorie.</UpgradeCard>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Comparaison avec les mois précédents</CardTitle>
                  <CardDescription>Mois partiels ramenés à un mois complet (estimation).</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1.5 font-medium">Mois</th>
                        <th className="py-1.5 text-right font-medium">Dépenses</th>
                        <th className="py-1.5 text-right font-medium">Évolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {a.history.map((m, i) => {
                        const n = normalizeMonth(m)
                        const prev = i > 0 ? normalizeMonth(a.history[i - 1]).expenses : null
                        const change = prev ? (n.expenses - prev) / prev : null
                        return (
                          <tr key={m.month}>
                            <td className="py-2">
                              {monthLabel(m.month, 'long')}
                              {m.coverage < 0.999 && <span className="ml-1 text-xs text-muted-foreground">(estimé)</span>}
                            </td>
                            <td className="tabular py-2 text-right font-medium">{formatEuros(n.expenses)}</td>
                            <td className={cn('tabular py-2 text-right', change !== null && change > 0 ? 'text-warning' : 'text-success')}>
                              {change === null ? '—' : `${change > 0 ? '+' : ''}${formatPercent(change)}`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>

          <RecurringPayments a={a} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className={cn(comparisons === false && 'hidden')}>
              <CardHeader>
                <CardTitle>Évolutions inhabituelles</CardTitle>
                <CardDescription>Hausses et baisses importantes entre les deux derniers mois comparables.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {changes.map((c) => (
                  <p key={c.categoryCode} className="flex justify-between gap-2">
                    <span>{findCategory(c.categoryCode).label}</span>
                    <span className={cn('tabular font-medium', c.change > 0 ? 'text-warning' : 'text-success')}>
                      {formatEuros(c.previous)} → {formatEuros(c.current)}
                    </span>
                  </p>
                ))}
                {increases.map((f) => (
                  <p key={f.code} className="flex gap-2 text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {f.explanation}
                  </p>
                ))}
                {!changes.length && !increases.length && <p className="text-muted-foreground">Rien d’inhabituel sur la période disponible.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Frais bancaires détectés</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {fees.map((t) => (
                  <p key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {formatDate(t.opDate)} · {t.label}
                    </span>
                    <span className="tabular shrink-0 font-medium">{formatEuros(-t.amount)}</span>
                  </p>
                ))}
                {!fees.length && <p className="text-muted-foreground">Aucun frais bancaire identifié pour cette sélection.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dépenses à vérifier</CardTitle>
                <CardDescription>Catégorie incertaine ou opération non classée.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {toReview.slice(0, 6).map((t) => (
                  <p key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">{t.label}</span>
                    <span className="tabular shrink-0 font-medium">{formatEuros(t.amount, { signed: true })}</span>
                  </p>
                ))}
                {toReview.length > 0 ? (
                  <Link to={`/app/releves/${toReview[0].importId}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    Les vérifier <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : (
                  <p className="text-muted-foreground">Toutes vos opérations sont classées.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </Container>
  )
}
