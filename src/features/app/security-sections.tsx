// Sections « Activité de sécurité », « Accès de l'assistance » et « Conservation des données ».
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, LifeBuoy, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/feedback/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/form-controls'
import { useProfile, useUpdateProfile, type Profile } from '@/features/finance/api'
import { useAuth } from '@/lib/use-auth'
import { supabase } from '@/lib/supabase'
import { AUDIT_LABELS } from './audit-labels'
import { SettingsSection } from './settings-sections'

interface AuditRow {
  id: number
  action: string
  actor_id: string | null
  created_at: string
}

export function SecurityActivitySection() {
  const { user } = useAuth()
  const logs = useQuery({
    queryKey: ['my_audit_logs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, actor_id, created_at')
        .or(`actor_id.eq.${user!.id},target_user_id.eq.${user!.id}`)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as AuditRow[]
    },
  })
  return (
    <SettingsSection id="activite" title="Activité de sécurité" description="Les dernières opérations sensibles sur votre compte. Une opération que vous ne reconnaissez pas ? Changez votre mot de passe et contactez-nous.">
      {logs.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : logs.error ? (
        <Alert tone="error">Le journal n’a pas pu être chargé.</Alert>
      ) : !logs.data?.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="size-4" aria-hidden /> Aucune opération sensible enregistrée.
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {logs.data.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                {AUDIT_LABELS[l.action] ?? l.action}
                {l.actor_id && l.actor_id !== user?.id && (
                  <Badge tone="warning" className="ml-2">
                    par l’équipe Economiz
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  )
}

interface Grant {
  id: string
  reason: string
  granted_at: string
  expires_at: string
  revoked_at: string | null
}

const DURATIONS = [
  { hours: 24, label: '24 heures' },
  { hours: 72, label: '3 jours' },
  { hours: 168, label: '7 jours' },
]

export function SupportAccessSection() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [hours, setHours] = useState(72)
  const [formError, setFormError] = useState<string | null>(null)
  const key = ['support_grants', user?.id]
  const grants = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('support_access_grants').select('id, reason, granted_at, expires_at, revoked_at').order('granted_at', { ascending: false }).limit(10)
      if (error) throw error
      const now = Date.now()
      return (data as Grant[]).filter((g) => !g.revoked_at && Date.parse(g.expires_at) > now)
    },
  })
  const grant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('support_access_grants').insert({ reason: reason.trim(), expires_at: new Date(Date.now() + hours * 3_600_000).toISOString() })
      if (error) throw error
    },
    onSuccess: () => {
      setReason('')
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['my_audit_logs'] })
    },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('support_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['my_audit_logs'] })
    },
  })

  const active = grants.data ?? []
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (reason.trim().length < 3) return setFormError('Indiquez en quelques mots l’objet de votre demande.')
    setFormError(null)
    grant.mutate()
  }

  return (
    <SettingsSection
      id="assistance"
      title="Accès de l’assistance"
      description="Par défaut, l’équipe Economiz n’a aucun accès à vos relevés ni à vos opérations. Pour résoudre un problème, vous pouvez autoriser temporairement l’assistance à consulter l’état technique de votre compte."
    >
      <ul className="mb-4 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Visible : état de vos imports (dates, statut, erreurs), nombre de lignes de budget et d’objectifs, offre.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Jamais visible : le contenu de vos relevés, vos opérations, vos montants, vos conversations.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Chaque consultation est enregistrée et apparaît dans votre activité de sécurité.
        </li>
      </ul>

      {active.map((g) => (
        <Alert key={g.id} tone="info" className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Accès accordé jusqu’au {new Date(g.expires_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · « {g.reason} »
            </span>
            <Button size="sm" variant="outline" onClick={() => revoke.mutate(g.id)} state={revoke.isPending ? 'loading' : 'idle'}>
              Retirer l’accès
            </Button>
          </div>
        </Alert>
      ))}

      {active.length === 0 && (
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <Field label="Objet de la demande" error={formError}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. mon relevé de mars ne s’analyse pas" aria-describedby={describedBy} aria-invalid={invalid} />
            )}
          </Field>
          <Field label="Durée">
            {({ id }) => (
              <Select id={id} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d.hours} value={d.hours}>
                    {d.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="submit" variant="outline" state={grant.isPending ? 'loading' : 'idle'}>
            <LifeBuoy aria-hidden /> Autoriser
          </Button>
        </form>
      )}
      {(grant.isError || revoke.isError) && <Alert tone="error" className="mt-3">L’opération a échoué, réessayez.</Alert>}
    </SettingsSection>
  )
}

const RETENTION: { days: Profile['coach_retention_days']; label: string }[] = [
  { days: 30, label: '1 mois' },
  { days: 90, label: '3 mois' },
  { days: 365, label: '1 an (par défaut)' },
  { days: 730, label: '2 ans' },
]

export function RetentionSection() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const value = profile.data?.coach_retention_days ?? 365
  return (
    <SettingsSection id="conservation" title="Conservation des données">
      <Field label="Conservation des conversations avec le coach IA" hint="Les conversations plus anciennes sont supprimées automatiquement chaque nuit.">
        {({ id, describedBy }) => (
          <Select
            id={id}
            className="sm:max-w-xs"
            aria-describedby={describedBy}
            value={value}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ coach_retention_days: Number(e.target.value) as Profile['coach_retention_days'] })}
          >
            {RETENTION.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {update.isError && <Alert tone="error" className="mt-3">Le choix n’a pas pu être enregistré.</Alert>}
      <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        <li>Relevés, opérations, budget et objectifs : conservés tant que votre compte existe, supprimables à tout moment.</li>
        <li>Journaux techniques : 90 jours, sans donnée bancaire.</li>
        <li>Compte inactif depuis 3 ans : vous êtes prévenu par email, puis le compte est supprimé 30 jours plus tard sans reconnexion.</li>
        <li>Factures : conservées 10 ans par notre prestataire de paiement, conformément aux obligations comptables.</li>
      </ul>
    </SettingsSection>
  )
}
