// Assistance : demandes reçues (statut, note interne) et consultation d'un
// compte, uniquement avec l'accord en cours de son titulaire (journalisée).
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { Select, Textarea } from '@/components/ui/form-controls'
import { useAuth } from '@/lib/use-auth'
import { adminErrorMessage, findUser, supportUserOverview, useSupportRequests, useUpdateSupportRequest, type FoundUser, type SupportOverview, type SupportRequest, type SupportStatus } from './admin-api'

const STATUS: Record<SupportStatus, { label: string; tone: 'danger' | 'warning' | 'success' }> = {
  new: { label: 'Nouvelle', tone: 'danger' },
  in_progress: { label: 'En cours', tone: 'warning' },
  resolved: { label: 'Résolue', tone: 'success' },
}
const TOPIC: Record<string, string> = { question: 'Question', technique: 'Problème technique', abonnement: 'Abonnement', donnees: 'Données personnelles', autre: 'Autre' }
const dateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

function RequestItem({ r }: { r: SupportRequest }) {
  const { user } = useAuth()
  const update = useUpdateSupportRequest()
  const [note, setNote] = useState(r.internal_note ?? '')
  const [open, setOpen] = useState(false)
  return (
    <li className="py-3">
      <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
        <span className="font-medium">{TOPIC[r.topic] ?? r.topic}</span>
        <span className="text-sm text-muted-foreground">
          {r.name} · {r.email}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{r.message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Statut" className="w-40" value={r.status} onChange={(e) => update.mutate({ id: r.id, status: e.target.value as SupportStatus })}>
              {(Object.keys(STATUS) as SupportStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </Select>
            {r.assigned_to !== user?.id && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: r.id, assigned_to: user!.id, ...(r.status === 'new' ? { status: 'in_progress' as const } : {}) })}>
                Me l’attribuer
              </Button>
            )}
            {r.assigned_to === user?.id && <Badge tone="primary">Attribuée à vous</Badge>}
            <a href={`mailto:${r.email}?subject=${encodeURIComponent('Votre demande à Economiz')}`} className="text-sm font-medium text-primary hover:underline">
              Répondre par email
            </a>
          </div>
          <label className="block text-sm font-medium" htmlFor={`note-${r.id}`}>
            Note interne (jamais visible par l’utilisateur)
          </label>
          <Textarea id={`note-${r.id}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="outline" disabled={note === (r.internal_note ?? '')} state={update.isPending ? 'loading' : 'idle'} onClick={() => update.mutate({ id: r.id, internal_note: note.trim() || null })}>
            Enregistrer la note
          </Button>
          {update.isError && <Alert tone="error">{adminErrorMessage(update.error)}</Alert>}
        </div>
      )}
    </li>
  )
}

function UserLookup() {
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<FoundUser | null | undefined>(undefined)
  const [overview, setOverview] = useState<SupportOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) return
    setLoading(true)
    setError(null)
    setOverview(null)
    try {
      setFound(await findUser(email))
    } catch (err) {
      setError(adminErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  const view = async () => {
    if (!found) return
    setError(null)
    try {
      setOverview(await supportUserOverview(found.id))
    } catch (err) {
      setError(adminErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrouver un compte</CardTitle>
        <CardDescription>
          Recherche par email exact (journalisée). L’état technique d’un compte n’est consultable que si son titulaire a accordé un accès temporaire depuis ses
          paramètres ; chaque consultation lui est visible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={search} className="flex gap-2">
          <Input type="email" aria-label="Email du compte" placeholder="email@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="outline" state={loading ? 'loading' : 'idle'}>
            <Search aria-hidden /> Rechercher
          </Button>
        </form>
        {error && <Alert tone="error">{error}</Alert>}
        {found === null && <p className="text-sm text-muted-foreground">Aucun compte ne correspond à cet email.</p>}
        {found && (
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">{found.email}</p>
            <p className="mt-1 text-muted-foreground">
              Inscrit le {dateTime(found.created_at)} · dernière connexion {found.last_sign_in_at ? dateTime(found.last_sign_in_at) : '—'} · offre {found.plan === 'free' ? 'Découverte' : found.plan}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {found.has_active_grant ? <Badge tone="success">Accès accordé par l’utilisateur</Badge> : <Badge>Aucun accès accordé</Badge>}
              {found.has_active_grant && (
                <Button size="sm" variant="outline" onClick={() => void view()}>
                  Consulter l’état technique
                </Button>
              )}
            </div>
          </div>
        )}
        {overview && (
          <div className="space-y-3 rounded-lg border border-warning/40 p-4 text-sm">
            <p className="font-medium">
              État technique · accès valable jusqu’au {dateTime(overview.grant_expires_at)}
            </p>
            <p className="text-muted-foreground">
              Parcours {overview.onboarding_path ?? 'non choisi'} · {overview.budget_lines} ligne{overview.budget_lines > 1 ? 's' : ''} de budget · {overview.goals} objectif{overview.goals > 1 ? 's' : ''}
            </p>
            {overview.imports.length ? (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Imports du compte">
                <table className="w-full min-w-[34rem]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-medium">Import</th>
                      <th className="py-1.5 font-medium">Statut</th>
                      <th className="py-1.5 font-medium">Période</th>
                      <th className="py-1.5 text-right font-medium">Opérations</th>
                      <th className="py-1.5 font-medium">Soldes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.imports.map((i) => (
                      <tr key={i.id}>
                        <td className="py-1.5">{dateTime(i.created_at)}</td>
                        <td className="py-1.5">
                          {i.status}
                          {i.error_code && ` (${i.error_code})`}
                        </td>
                        <td className="py-1.5">{i.period_start ? `${i.period_start} → ${i.period_end}` : '—'}</td>
                        <td className="tabular py-1.5 text-right">{i.operations_count}</td>
                        <td className="py-1.5">{i.balance_check ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">Aucun relevé importé.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function AdminSupportPage() {
  const [filter, setFilter] = useState<SupportStatus | 'open' | 'all'>('open')
  const requests = useSupportRequests(filter)
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Assistance</h1>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <CardTitle>Demandes</CardTitle>
          <Select aria-label="Filtrer les demandes" className="w-44" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="open">À traiter</option>
            <option value="new">Nouvelles</option>
            <option value="in_progress">En cours</option>
            <option value="resolved">Résolues</option>
            <option value="all">Toutes</option>
          </Select>
        </CardHeader>
        <CardContent>
          {requests.isLoading ? (
            <LoadingState />
          ) : requests.error ? (
            <ErrorState onRetry={() => void requests.refetch()} />
          ) : !requests.data?.length ? (
            <p className="text-sm text-muted-foreground">Aucune demande.</p>
          ) : (
            <ul className="divide-y divide-border">
              {requests.data.map((r) => (
                <RequestItem key={r.id} r={r} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <UserLookup />
    </>
  )
}
