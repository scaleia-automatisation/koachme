// « Mes objectifs » : progression, délai estimé et contributions confirmées.
// Un virement d'épargne n'est jamais affecté automatiquement : il est proposé,
// et l'utilisateur confirme le rattachement et le montant.
import { CalendarClock, Pencil, PiggyBank, Plus, Target, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Progress, Select } from '@/components/ui/form-controls'
import { contributionSuggestions, formatEuros, GOAL_KIND_LABELS, parseEuros, type GoalKind, type GoalProgress } from '@/domain'
import { PlanLimitError, useAddContribution, useContributions, useDeleteContribution, useDeleteGoal, useSaveGoal, type GoalContribution } from '@/features/finance/api'
import { useAnalysis } from '@/features/finance/use-analysis'
import { useDocumentTitle } from '@/lib/use-document-title'
import { formatDate } from './import-meta'
import { useIsPremium, useLimit } from '@/features/finance/use-entitlement'
import { UpgradeCard } from './premium'

const toText = (cents: number | null | undefined) => (cents ? (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ /g, ' ') : '')
const todayIso = () => new Date().toISOString().slice(0, 10)

interface GoalDraft {
  id?: string
  name: string
  kind: GoalKind
  target: string
  saved: string
  monthly: string
  date: string
}

function GoalForm({ initial, onDone }: { initial: GoalDraft; onDone: () => void }) {
  const save = useSaveGoal()
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof GoalDraft) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const target = parseEuros(form.target)
    const saved = form.saved.trim() ? parseEuros(form.saved) : 0
    const monthly = form.monthly.trim() ? parseEuros(form.monthly) : null
    if (!form.name.trim()) return setError('Donnez un nom à votre objectif')
    if (!target || target < 100) return setError('Indiquez un montant cible valide (1 € minimum)')
    if (saved === null || saved < 0) return setError('Montant actuel invalide')
    if (form.monthly.trim() && (monthly === null || monthly <= 0)) return setError('Contribution mensuelle invalide')
    setError(null)
    save.mutate(
      {
        id: form.id,
        name: form.name,
        kind: form.kind,
        targetAmount: target,
        savedAmount: saved,
        monthlyContribution: monthly,
        targetDate: form.date || null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de l’objectif">{({ id }) => <Input id={id} maxLength={80} value={form.name} onChange={set('name')} placeholder="Ex. vacances d’été" />}</Field>
        <Field label="Type">
          {({ id }) => (
            <Select id={id} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as GoalKind })}>
              {(Object.keys(GOAL_KIND_LABELS) as GoalKind[]).map((k) => (
                <option key={k} value={k}>
                  {GOAL_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Montant cible (€)">{({ id }) => <Input id={id} inputMode="decimal" value={form.target} onChange={set('target')} />}</Field>
        <Field label="Montant déjà réuni (€)" hint="Au moment de la création de l’objectif.">
          {({ id, describedBy }) => <Input id={id} inputMode="decimal" placeholder="0" value={form.saved} onChange={set('saved')} aria-describedby={describedBy} />}
        </Field>
        <Field label="Échéance (facultatif)">{({ id }) => <Input id={id} type="date" value={form.date} onChange={set('date')} />}</Field>
        <Field label="Contribution mensuelle prévue (facultatif, €)">{({ id }) => <Input id={id} inputMode="decimal" value={form.monthly} onChange={set('monthly')} />}</Field>
      </div>
      {(error || save.isError) && (
        <Alert tone="error">{error ?? (save.error instanceof PlanLimitError ? 'Vous avez atteint le nombre maximal d’objectifs de votre offre.' : 'L’enregistrement a échoué, réessayez.')}</Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" state={save.isPending ? 'loading' : 'idle'}>
          Enregistrer
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  )
}

function ContributionForm({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const add = useAddContribution()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const cents = parseEuros(amount)
    if (!cents || cents === 0) return setError('Montant invalide (négatif pour un retrait)')
    setError(null)
    add.mutate({ goalId, amount: cents, contributedOn: date }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-muted p-3">
      <Field label="Montant (€)" className="w-32">
        {({ id }) => <Input id={id} inputMode="decimal" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Field label="Date" className="w-40">
        {({ id }) => <Input id={id} type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Button type="submit" size="sm" state={add.isPending ? 'loading' : 'idle'}>
        Confirmer
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Annuler
      </Button>
      {error && <p className="w-full text-xs font-medium text-danger">{error}</p>}
    </form>
  )
}

function GoalCard({ g, contributions, onEdit }: { g: GoalProgress; contributions: GoalContribution[]; onEdit: () => void }) {
  const del = useDeleteGoal()
  const delContribution = useDeleteContribution()
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const goal = g.goal
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{goal.name}</CardTitle>
            <CardDescription>{GOAL_KIND_LABELS[goal.kind ?? 'other']}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {g.reached ? (
              <Badge tone="success">Atteint</Badge>
            ) : g.onTrack !== null ? (
              <Badge tone={g.onTrack ? 'success' : 'warning'}>{g.onTrack ? 'Échéance tenable' : 'Rythme insuffisant'}</Badge>
            ) : null}
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Modifier ${goal.name}`} onClick={onEdit}>
              <Pencil />
            </Button>
            {confirmDelete ? (
              <Button size="sm" variant="danger" onClick={() => del.mutate(goal.id)} state={del.isPending ? 'loading' : 'idle'}>
                Supprimer
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Supprimer ${goal.name}`} onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="tabular text-2xl font-semibold">{formatEuros(g.current)}</span>
            <span className="tabular text-sm text-muted-foreground">sur {formatEuros(goal.targetAmount)}</span>
          </div>
          <Progress value={g.progress * 100} label={`Progression de ${goal.name}`} tone={g.reached ? 'success' : 'primary'} className="mt-2 h-3" />
          <p className="tabular mt-1 text-xs text-muted-foreground">
            {Math.round(g.progress * 100)} % · reste {formatEuros(g.remaining)}
          </p>
        </div>
        <dl className="grid gap-1.5 text-sm">
          {goal.targetDate && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Échéance</dt>
              <dd>
                {formatDate(goal.targetDate)}
                {g.requiredMonthly ? ` · ${formatEuros(g.requiredMonthly)} / mois nécessaires` : ''}
              </dd>
            </div>
          )}
          {goal.monthlyContribution ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Contribution prévue</dt>
              <dd className="tabular">{formatEuros(goal.monthlyContribution)} / mois</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden /> Délai estimé
            </dt>
            <dd className="text-right">
              {g.reached
                ? 'Objectif atteint'
                : g.estimate
                  ? `${formatDate(g.estimate.date)} (${g.estimate.basis === 'contribution' ? 'selon votre contribution prévue' : 'à votre capacité d’épargne actuelle'})`
                  : 'Non calculable : indiquez une contribution mensuelle'}
            </dd>
          </div>
        </dl>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Contributions confirmées</p>
            {!adding && (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                <Plus aria-hidden /> Ajouter
              </Button>
            )}
          </div>
          {adding && <ContributionForm goalId={goal.id} onDone={() => setAdding(false)} />}
          <ul className="mt-2 divide-y divide-border text-sm">
            {contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted-foreground">
                  {formatDate(c.contributedOn)}
                  {c.transactionId && ' · virement associé'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="tabular font-medium">{formatEuros(c.amount, { signed: true })}</span>
                  <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" aria-label="Retirer cette contribution" onClick={() => delContribution.mutate(c.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
            {!contributions.length && !adding && <li className="py-1.5 text-muted-foreground">Aucune contribution pour l’instant.</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export function GoalsPage() {
  useDocumentTitle('Mes objectifs')
  const analysis = useAnalysis()
  const contributions = useContributions()
  const addContribution = useAddContribution()
  const [params, setParams] = useSearchParams()
  const presetKind = params.get('nouveau') as GoalKind | null
  const [editing, setEditing] = useState<GoalDraft | null>(null)
  const [suggestionGoal, setSuggestionGoal] = useState<Record<string, string>>({})
  const [suggestionAmount, setSuggestionAmount] = useState<Record<string, string>>({})
  const maxGoals = useLimit('max_goals')
  const premium = useIsPremium()

  const a = analysis.data
  const suggestions = useMemo(() => {
    if (!a || !contributions.data) return []
    const linked = new Set(contributions.data.map((c) => c.transactionId).filter((x): x is string => !!x))
    return contributionSuggestions(a.analyzed, linked).slice(0, 6)
  }, [a, contributions.data])

  if (analysis.isLoading || contributions.isLoading) return <LoadingState className="py-24" />
  if (analysis.error || !a) return <ErrorState onRetry={analysis.refetch} className="py-24" />

  const emptyDraft = (kind: GoalKind = 'other'): GoalDraft => ({
    name: kind === 'other' ? '' : GOAL_KIND_LABELS[kind],
    kind,
    target: kind === 'emergency_fund' && a.summary.essentialExpenses ? toText(a.summary.essentialExpenses * 3) : '',
    saved: kind === 'emergency_fund' ? toText(a.situation?.savingsAvailable) : '',
    monthly: '',
    date: '',
  })
  // Limite d'objectifs de l'offre (appliquée aussi par la base).
  const atLimit = maxGoals !== undefined && maxGoals !== null && a.goals.length >= maxGoals
  const requested = editing ?? (presetKind && a.goals.every((g) => g.goal.kind !== presetKind) ? emptyDraft(presetKind) : null)
  const form = requested && (requested.id || !atLimit) ? requested : null
  const closeForm = () => {
    setEditing(null)
    if (presetKind) setParams({}, { replace: true })
  }
  const reached = a.goals.filter((g) => g.reached).length
  const remaining = a.goals.reduce((s, g) => s + g.remaining, 0)

  return (
    <Container className="max-w-4xl space-y-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes objectifs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.goals.length
              ? `${reached} atteint${reached > 1 ? 's' : ''} sur ${a.goals.length} · reste ${formatEuros(remaining)} à réunir · capacité d’épargne estimée ${formatEuros(a.capacity)} / mois`
              : 'Donnez un but à votre épargne.'}
          </p>
        </div>
        {!form && !atLimit && (
          <Button onClick={() => setEditing(emptyDraft())}>
            <Plus aria-hidden /> Nouvel objectif
          </Button>
        )}
      </div>

      {atLimit &&
        !form &&
        (premium === false ? (
          <UpgradeCard title={maxGoals === 1 ? 'L’offre Découverte inclut un objectif d’épargne' : `Votre offre inclut ${maxGoals} objectifs`}>
            Avec Premium, suivez plusieurs objectifs en parallèle (précaution, projet, dette…) et simulez leur délai selon votre capacité d’épargne.
          </UpgradeCard>
        ) : (
          <Alert tone="info">Vous suivez déjà {maxGoals} objectifs, le maximum de votre offre. Supprimez un objectif atteint pour en créer un nouveau.</Alert>
        ))}

      {form && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? 'Modifier l’objectif' : 'Nouvel objectif'}</CardTitle>
            {form.kind === 'emergency_fund' && !form.id && a.summary.essentialExpenses > 0 && (
              <CardDescription>Repère : 3 mois de dépenses essentielles, soit {formatEuros(a.summary.essentialExpenses * 3)}.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <GoalForm key={form.id ?? form.kind} initial={form} onDone={closeForm} />
          </CardContent>
        </Card>
      )}

      {suggestions.length > 0 && a.goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="size-4 text-primary" aria-hidden /> Virements d’épargne à associer ?
            </CardTitle>
            <CardDescription>Ces virements ont été identifiés sur vos relevés. Ils ne sont comptés dans un objectif que si vous le confirmez, pour le montant que vous indiquez.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {suggestions.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.opDate)} · {formatEuros(-t.amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label="Objectif"
                      className="h-9 w-44 text-sm"
                      value={suggestionGoal[t.id] ?? ''}
                      onChange={(e) =>
                        setSuggestionGoal({
                          ...suggestionGoal,
                          [t.id]: e.target.value,
                        })
                      }
                    >
                      <option value="">Choisir un objectif</option>
                      {a.goals.map((g) => (
                        <option key={g.goal.id} value={g.goal.id}>
                          {g.goal.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Montant à associer"
                      inputMode="decimal"
                      className="h-9 w-28"
                      value={suggestionAmount[t.id] ?? toText(-t.amount)}
                      onChange={(e) =>
                        setSuggestionAmount({
                          ...suggestionAmount,
                          [t.id]: e.target.value,
                        })
                      }
                    />
                    <Button
                      size="sm"
                      disabled={!suggestionGoal[t.id] || addContribution.isPending}
                      onClick={() => {
                        const cents = parseEuros(suggestionAmount[t.id] ?? toText(-t.amount))
                        if (!cents || cents <= 0) return
                        addContribution.mutate({
                          goalId: suggestionGoal[t.id],
                          amount: cents,
                          contributedOn: t.opDate,
                          transactionId: t.id,
                        })
                      }}
                    >
                      Confirmer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {a.goals.length === 0 && !form ? (
        <Card>
          <EmptyState icon={Target} title="Aucun objectif pour l’instant" description="Épargne de précaution, achat, vacances, réduction d’une dette, réserve pour imprévus…" />
          <div className="flex flex-wrap justify-center gap-2 px-5 pb-6">
            {(Object.keys(GOAL_KIND_LABELS) as GoalKind[])
              .filter((k) => k !== 'other')
              .map((k) => (
                <Button key={k} variant="outline" size="sm" onClick={() => setEditing(emptyDraft(k))}>
                  {GOAL_KIND_LABELS[k]}
                </Button>
              ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {a.goals.map((g) => (
            <GoalCard
              key={g.goal.id}
              g={g}
              contributions={(contributions.data ?? []).filter((c) => c.goalId === g.goal.id)}
              onEdit={() =>
                setEditing({
                  id: g.goal.id,
                  name: g.goal.name,
                  kind: g.goal.kind ?? 'other',
                  target: toText(g.goal.targetAmount),
                  saved: toText(g.goal.savedAmount),
                  monthly: toText(g.goal.monthlyContribution),
                  date: g.goal.targetDate ?? '',
                })
              }
            />
          ))}
        </div>
      )}
    </Container>
  )
}
