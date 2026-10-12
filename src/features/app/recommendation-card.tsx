// Carte de recommandation : problème, données justificatives, action,
// économie potentielle (théorique), priorité, difficulté et suivi.
// Une économie n'est comptée comme réelle que si l'utilisateur marque l'action
// « Réalisée » ET saisit le montant réellement constaté.
import { ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/form-controls'
import { ACTION_STATUS_LABELS, PRIORITY_LABELS, formatEuros, parseEuros, type ActionStatus, type Recommendation } from '@/domain'
import { useSetActionStatus } from '@/features/finance/api'
import { cn } from '@/lib/utils'

const PRIORITY_TONE = { 1: 'danger', 2: 'warning', 3: 'primary' } as const

export function RecommendationCard({ rec, index, compact = false }: { rec: Recommendation; index?: number; compact?: boolean }) {
  const setStatus = useSetActionStatus()
  const [saving, setSaving] = useState(rec.confirmedSaving ? String(rec.confirmedSaving / 100).replace('.', ',') : '')
  const [savingError, setSavingError] = useState<string | null>(null)

  const changeStatus = (status: ActionStatus) => setStatus.mutate({ key: rec.key, status, confirmedSaving: status === 'done' ? rec.confirmedSaving : null })
  const confirmSaving = () => {
    const cents = saving.trim() ? parseEuros(saving) : null
    if (saving.trim() && (cents === null || cents < 0)) return setSavingError('Montant invalide')
    setSavingError(null)
    setStatus.mutate({ key: rec.key, status: 'done', confirmedSaving: cents })
  }

  return (
    <article className={cn('rounded-xl border border-border bg-surface p-4 sm:p-5', rec.status === 'done' && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        {index !== undefined && <span className="tabular flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>}
        <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABELS[rec.priority]}</Badge>
        <Badge>Difficulté {rec.difficulty}</Badge>
      </div>
      <h3 className="mt-3 font-semibold">{rec.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{rec.problem}</p>
      {!compact && rec.evidence.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {rec.evidence.map((e) => (
            <li key={e} className="tabular">
              • {e}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm">
        <span className="font-medium">Action : </span>
        {rec.action}
      </p>
      {rec.potentialHypothesis && <p className="mt-1 text-xs text-muted-foreground">{rec.potentialHypothesis}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={rec.cta.to}>
            {rec.cta.label} <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Select
          aria-label={`Suivi de l’action « ${rec.title} »`}
          value={rec.status}
          disabled={setStatus.isPending}
          onChange={(e) => changeStatus(e.target.value as ActionStatus)}
          className="h-9 w-auto text-sm"
        >
          {(Object.keys(ACTION_STATUS_LABELS) as ActionStatus[]).map((s) => (
            <option key={s} value={s}>
              {ACTION_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {rec.status === 'done' && (
        <div className="mt-3 rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">
            Économie réellement constatée par mois (facultatif) : seul ce montant, s’il est saisi, est compté dans vos économies confirmées.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative w-36">
              <Input aria-label="Économie mensuelle constatée" inputMode="decimal" placeholder="0" className="h-9 pr-7" value={saving} onChange={(e) => setSaving(e.target.value)} />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">€</span>
            </div>
            <Button size="sm" variant="secondary" onClick={confirmSaving} state={setStatus.isPending ? 'loading' : 'idle'}>
              <Check aria-hidden /> Enregistrer
            </Button>
            {rec.confirmedSaving !== null && <span className="text-xs font-medium text-success">Confirmé : {formatEuros(rec.confirmedSaving)} / mois</span>}
          </div>
          {savingError && <p className="mt-1 text-xs font-medium text-danger">{savingError}</p>}
        </div>
      )}
      {setStatus.isError && <p className="mt-2 text-xs font-medium text-danger">L’enregistrement a échoué, réessayez.</p>}
    </article>
  )
}
