// Pages réservées aux administrateurs : offres et limites, FAQ, journal de
// sécurité, gestion de l'équipe. La base refuse ces opérations à tout autre rôle.
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { AUDIT_LABELS } from '@/features/app/audit-labels'
import type { Plan, PlanLimits } from '@/features/finance/billing'
import { useAuth } from '@/lib/use-auth'
import {
  adminErrorMessage,
  useAdminFaq,
  useAdminPlans,
  useAuditLogs,
  useDeleteFaq,
  useSaveFaq,
  useSetRole,
  useStaff,
  useUpdatePlan,
  type FaqItem,
} from './admin-api'

const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const euros = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','))
const toCents = (v: string): number | null | 'invalid' => {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 'invalid'
}

// ---------------------------------------------------------------------------
// Offres et limites
// ---------------------------------------------------------------------------

const NUMERIC_LIMITS: { key: keyof PlanLimits; label: string }[] = [
  { key: 'statement_imports_per_month', label: 'Relevés analysés par mois' },
  { key: 'coach_questions_per_month', label: 'Questions au coach par mois' },
  { key: 'max_goals', label: 'Objectifs d’épargne' },
  { key: 'pdf_exports_per_month', label: 'Exports PDF par mois' },
]
const BOOLEAN_LIMITS: { key: keyof PlanLimits; label: string }[] = [
  { key: 'monthly_history', label: 'Historique des bilans mensuels' },
  { key: 'detailed_comparisons', label: 'Comparaisons détaillées' },
  { key: 'advanced_recommendations', label: 'Recommandations avancées' },
]

function PlanEditor({ plan }: { plan: Required<Plan> }) {
  const update = useUpdatePlan()
  const [form, setForm] = useState({
    name: plan.name,
    tagline: plan.tagline,
    monthly: euros(plan.monthly_price_cents),
    yearly: euros(plan.yearly_price_cents),
    stripeMonthly: plan.stripe_price_monthly ?? '',
    stripeYearly: plan.stripe_price_yearly ?? '',
    limits: Object.fromEntries(Object.entries(plan.limits).map(([k, v]) => [k, typeof v === 'boolean' ? v : v === null ? '' : String(v)])) as Record<string, string | boolean>,
    features: plan.features.join('\n'),
    highlighted: plan.highlighted,
    is_active: plan.is_active,
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const monthly = toCents(form.monthly)
    const yearly = toCents(form.yearly)
    if (monthly === 'invalid' || monthly === null || yearly === 'invalid') return setError('Prix invalide.')
    const limits = {} as Record<string, number | null | boolean>
    for (const { key } of NUMERIC_LIMITS) {
      const raw = String(form.limits[key]).trim()
      if (raw && !/^\d+$/.test(raw)) return setError('Les limites sont des nombres entiers (vide = sans limite).')
      limits[key] = raw ? Number(raw) : null
    }
    for (const { key } of BOOLEAN_LIMITS) limits[key] = Boolean(form.limits[key])
    for (const s of [form.stripeMonthly, form.stripeYearly]) if (s && !/^price_[A-Za-z0-9]+$/.test(s.trim())) return setError('Identifiant de prix Stripe invalide (price_…).')
    setError(null)
    update.mutate({
      id: plan.id,
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      monthly_price_cents: monthly,
      yearly_price_cents: yearly,
      stripe_price_monthly: form.stripeMonthly.trim() || null,
      stripe_price_yearly: form.stripeYearly.trim() || null,
      limits: limits as unknown as PlanLimits,
      features: form.features
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
      highlighted: form.highlighted,
      is_active: form.is_active,
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{plan.name}</CardTitle>
          <Badge>{plan.id}</Badge>
          {!plan.is_active && <Badge tone="warning">Masquée</Badge>}
        </div>
        {plan.id === 'free' && <CardDescription>Offre attribuée à tout compte sans abonnement actif.</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom">{({ id }) => <Input id={id} value={form.name} onChange={set('name')} maxLength={40} />}</Field>
            <Field label="Accroche">{({ id }) => <Input id={id} value={form.tagline} onChange={set('tagline')} maxLength={120} />}</Field>
            <Field label="Prix mensuel TTC (€)">{({ id }) => <Input id={id} inputMode="decimal" value={form.monthly} onChange={set('monthly')} />}</Field>
            <Field label="Prix annuel TTC (€)" hint="Vide = pas de formule annuelle.">
              {({ id, describedBy }) => <Input id={id} inputMode="decimal" value={form.yearly} onChange={set('yearly')} aria-describedby={describedBy} />}
            </Field>
            {plan.id !== 'free' && (
              <>
                <Field label="Prix Stripe mensuel" hint="Identifiant price_… créé dans Stripe, au même montant.">
                  {({ id, describedBy }) => <Input id={id} value={form.stripeMonthly} onChange={set('stripeMonthly')} placeholder="price_…" aria-describedby={describedBy} />}
                </Field>
                <Field label="Prix Stripe annuel">{({ id }) => <Input id={id} value={form.stripeYearly} onChange={set('stripeYearly')} placeholder="price_…" />}</Field>
              </>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Limites appliquées par le serveur</legend>
            <p className="text-xs text-muted-foreground">Champ vide = sans limite ; 0 = fonctionnalité non incluse.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {NUMERIC_LIMITS.map(({ key, label }) => (
                <Field key={key} label={label}>
                  {({ id }) => <Input id={id} inputMode="numeric" value={String(form.limits[key])} onChange={(e) => setForm({ ...form, limits: { ...form.limits, [key]: e.target.value } })} />}
                </Field>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {BOOLEAN_LIMITS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={Boolean(form.limits[key])} onChange={(e) => setForm({ ...form, limits: { ...form.limits, [key]: e.target.checked } })} /> {label}
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Arguments affichés (un par ligne)">{({ id }) => <Textarea id={id} rows={6} value={form.features} onChange={set('features')} />}</Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={form.highlighted} onChange={(e) => setForm({ ...form, highlighted: e.target.checked })} /> Mise en avant sur la page Tarifs
            </label>
            {plan.id !== 'free' && (
              <label className="flex items-center gap-2">
                <Checkbox checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Proposée à la souscription
              </label>
            )}
          </div>
          {(error || update.isError) && <Alert tone="error">{error ?? adminErrorMessage(update.error)}</Alert>}
          {update.isSuccess && !error && <Alert tone="success">Offre enregistrée. Les nouvelles limites s’appliquent immédiatement.</Alert>}
          <Button type="submit" state={update.isPending ? 'loading' : 'idle'}>
            Enregistrer
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function AdminPlansPage() {
  const plans = useAdminPlans()
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Offres et limites</h1>
      <Alert tone="info">
        Un changement de prix ne modifie pas les abonnements en cours : créez d’abord le nouveau prix dans Stripe, puis renseignez son identifiant ici. Les
        limites s’appliquent immédiatement à tous les comptes de l’offre.
      </Alert>
      {plans.isLoading ? <LoadingState /> : plans.error ? <ErrorState onRetry={() => void plans.refetch()} /> : plans.data?.map((p) => <PlanEditor key={`${p.id}-${p.updated_at}`} plan={p} />)}
    </>
  )
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

type FaqDraft = Omit<FaqItem, 'id'> & { id?: string }

function FaqForm({ initial, onDone }: { initial: FaqDraft; onDone: () => void }) {
  const save = useSaveFaq()
  const [form, setForm] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({ ...form, section: form.section.trim(), question: form.question.trim(), answer: form.answer.trim() }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Rubrique">{({ id }) => <Input id={id} required maxLength={60} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />}</Field>
        <Field label="Ordre">{({ id }) => <Input id={id} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />}</Field>
      </div>
      <Field label="Question">{({ id }) => <Input id={id} required minLength={5} maxLength={200} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />}</Field>
      <Field label="Réponse">{({ id }) => <Textarea id={id} required minLength={5} maxLength={2000} rows={4} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />}</Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /> Publiée
      </label>
      {save.isError && <Alert tone="error">{adminErrorMessage(save.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" state={save.isPending ? 'loading' : 'idle'}>
          Enregistrer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  )
}

export function AdminFaqPage() {
  const faq = useAdminFaq()
  const del = useDeleteFaq()
  const [editing, setEditing] = useState<FaqDraft | null>(null)
  const items = faq.data ?? []
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">FAQ</h1>
        {!editing && (
          <Button size="sm" onClick={() => setEditing({ section: items.at(-1)?.section ?? '', question: '', answer: '', sort_order: (items.at(-1)?.sort_order ?? 0) + 10, is_published: true })}>
            <Plus aria-hidden /> Nouvelle question
          </Button>
        )}
      </div>
      {editing && !editing.id && <FaqForm initial={editing} onDone={() => setEditing(null)} />}
      {faq.isLoading ? (
        <LoadingState />
      ) : faq.error ? (
        <ErrorState onRetry={() => void faq.refetch()} />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-2">
            {items.map((item) =>
              editing?.id === item.id ? (
                <div key={item.id} className="py-3">
                  <FaqForm initial={editing} onDone={() => setEditing(null)} />
                </div>
              ) : (
                <div key={item.id} className="flex gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {item.section} · {item.sort_order} {!item.is_published && <Badge tone="warning">Brouillon</Badge>}
                    </p>
                    <p className="font-medium">{item.question}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{item.answer}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Modifier « ${item.question} »`} onClick={() => setEditing(item)}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Supprimer « ${item.question} »`}
                    onClick={() => window.confirm(`Supprimer la question « ${item.question} » ?`) && del.mutate(item.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sécurité
// ---------------------------------------------------------------------------

const AUDIT_FILTERS = [
  { value: '', label: 'Tous les événements' },
  { value: 'auth', label: 'Authentification' },
  { value: 'support', label: 'Accès de l’assistance' },
  { value: 'admin', label: 'Administration' },
  { value: 'billing', label: 'Paiements' },
  { value: 'data', label: 'Exports de données' },
  { value: 'account', label: 'Suppressions de compte' },
]

export function AdminSecurityPage() {
  const [prefix, setPrefix] = useState('')
  const logs = useAuditLogs(prefix)
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Événements de sécurité</h1>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <CardDescription className="max-w-md">Journal d’audit : opérations sensibles des utilisateurs et de l’équipe. Les métadonnées ne contiennent aucune donnée bancaire.</CardDescription>
          <Select aria-label="Type d’événement" className="w-56" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
            {AUDIT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </CardHeader>
        <CardContent>
          {logs.isLoading ? (
            <LoadingState />
          ) : logs.error ? (
            <ErrorState onRetry={() => void logs.refetch()} />
          ) : !logs.data?.length ? (
            <p className="text-sm text-muted-foreground">Aucun événement.</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Journal d’audit">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Événement</th>
                    <th className="py-2 font-medium">Auteur</th>
                    <th className="py-2 font-medium">Compte concerné</th>
                    <th className="py-2 font-medium">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.data.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap py-2">{dateTime(l.created_at)}</td>
                      <td className="py-2">{AUDIT_LABELS[l.action] ?? l.action}</td>
                      <td className="py-2 font-mono text-xs">{l.actor_id ? l.actor_id.slice(0, 8) : 'système'}</td>
                      <td className="py-2 font-mono text-xs">{l.target_user_id?.slice(0, 8) ?? '—'}</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{Object.keys(l.metadata).length ? JSON.stringify(l.metadata) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Équipe
// ---------------------------------------------------------------------------

export function AdminTeamPage() {
  const { user } = useAuth()
  const staff = useStaff()
  const setRole = useSetRole()
  const [email, setEmail] = useState('')
  const [role, setRoleValue] = useState<'admin' | 'support'>('support')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) return
    setRole.mutate({ email: email.trim(), role, grant: true }, { onSuccess: () => setEmail('') })
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
      <Alert tone="info">
        « Assistance » : demandes, erreurs techniques, imports en échec, usage de l’IA, et consultation d’un compte avec l’accord de son titulaire.
        « Administrateur » : en plus, offres, FAQ, journal de sécurité et gestion de l’équipe. Aucun rôle ne donne accès au contenu des relevés.
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Membres</CardTitle>
        </CardHeader>
        <CardContent>
          {staff.isLoading ? (
            <LoadingState />
          ) : staff.error ? (
            <ErrorState onRetry={() => void staff.refetch()} />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {staff.data?.map((m) => (
                <li key={`${m.user_id}-${m.role}`} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="font-medium">{m.email}</span>
                  <Badge tone={m.role === 'admin' ? 'warning' : 'primary'}>{m.role === 'admin' ? 'Administrateur' : 'Assistance'}</Badge>
                  <span className="text-xs text-muted-foreground">depuis le {dateTime(m.granted_at)}</span>
                  {!(m.user_id === user?.id && m.role === 'admin') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-danger"
                      onClick={() => window.confirm(`Retirer le rôle à ${m.email} ?`) && setRole.mutate({ email: m.email, role: m.role, grant: false })}
                    >
                      Retirer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ajouter un membre</CardTitle>
          <CardDescription>La personne doit déjà avoir un compte Economiz. L’attribution est enregistrée dans le journal de sécurité.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Email">{({ id }) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <Field label="Rôle">
              {({ id }) => (
                <Select id={id} value={role} onChange={(e) => setRoleValue(e.target.value as 'admin' | 'support')}>
                  <option value="support">Assistance</option>
                  <option value="admin">Administrateur</option>
                </Select>
              )}
            </Field>
            <Button type="submit" state={setRole.isPending ? 'loading' : 'idle'}>
              Attribuer
            </Button>
          </form>
          {setRole.isError && <Alert tone="error" className="mt-3">{adminErrorMessage(setRole.error)}</Alert>}
        </CardContent>
      </Card>
    </>
  )
}
