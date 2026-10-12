// Parcours B (saisie guidée) et modification du budget à tout moment.
// Quatre étapes courtes ; aucune n'est obligatoire pour obtenir un bilan.
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { type ButtonState } from '@/components/ui/button'
import type { DeclaredEntry, EntrySource } from '@/domain'
import { useBudgetEntries, useSaveEntries } from '@/features/finance/api'
import { useAnalysis } from '@/features/finance/use-analysis'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { EntryEditor } from './entry-editor'
import { diffRows, initialRows, rowError, type Row } from './entry-rows'
import { SituationForm } from './situation-form'
import { StepNav } from './step-nav'
import { STEPS, type Step } from './steps'

function Stepper({ current, onSelect }: { current: number; onSelect: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Étapes">
      {STEPS.map((s, i) => (
        <li key={s.id}>
          <button type="button" onClick={() => onSelect(i)} className="group w-full text-left" aria-current={i === current ? 'step' : undefined}>
            <span className={cn('block h-1.5 rounded-full transition-colors', i <= current ? 'bg-primary' : 'bg-border group-hover:bg-muted-foreground/40')} />
            <span className={cn('mt-2 hidden text-xs font-medium sm:block', i === current ? 'text-foreground' : 'text-muted-foreground')}>
              {i + 1}. {s.title}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

interface StepEditorProps {
  step: Step
  mode: 'standard' | 'hors-releves'
  onDone: () => void
  onBack: () => void
  isFirst: boolean
  isLast: boolean
}

function StepEditor(props: StepEditorProps) {
  const entries = useBudgetEntries()
  if (entries.isLoading) return <LoadingState />
  if (entries.error || !entries.data) return <ErrorState onRetry={() => void entries.refetch()} />
  const { step, mode } = props
  // Instantané des lignes au chargement de l'étape : base de comparaison pour l'enregistrement.
  const existing = entries.data.filter((e) => step.available.includes(e.categoryCode) && (mode === 'standard' || e.source === 'off_statement'))
  return <StepForm {...props} existing={existing} />
}

function StepForm({ step, mode, onDone, onBack, isFirst, isLast, existing }: StepEditorProps & { existing: DeclaredEntry[] }) {
  const analysis = useAnalysis()
  const save = useSaveEntries()
  const hasStatements = (analysis.data?.imports ?? []).some((i) => i.status === 'needs_review' || i.status === 'confirmed')
  const defaultSource: EntrySource = mode === 'hors-releves' ? 'off_statement' : 'manual'
  const [rows, setRows] = useState<Row[]>(() => initialRows(existing, mode === 'hors-releves' ? [] : step.suggested, defaultSource))
  const [showErrors, setShowErrors] = useState(false)
  const [state, setState] = useState<ButtonState>('idle')

  const submit = async () => {
    if (rows.some((r) => rowError(r))) {
      setShowErrors(true)
      return
    }
    setState('loading')
    try {
      const changes = diffRows(rows, existing)
      if (changes.upserts.length || changes.deletions.length) await save.mutateAsync(changes)
      setState('success')
      setTimeout(onDone, 350)
    } catch {
      setState('error')
    }
  }

  return (
    <div className="space-y-6">
      {mode === 'hors-releves' && (
        <Alert tone="info">
          Ajoutez ici uniquement les revenus qui <strong>n’apparaissent pas</strong> sur vos relevés : espèces, loyers perçus, aides ou pension versées sur un
          autre compte, activité secondaire… Ils s’ajoutent à votre bilan sans double comptage.
        </Alert>
      )}
      {mode === 'hors-releves' && rows.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">Aucun revenu hors relevé pour l’instant. Ajoutez une ligne si nécessaire.</p>
      )}
      <EntryEditor
        rows={rows}
        onChange={(r) => {
          setRows(r)
          if (state !== 'idle') setState('idle')
        }}
        categories={step.available}
        defaultSource={defaultSource}
        offStatementToggle={hasStatements && mode === 'standard'}
        replacedIds={new Set(analysis.data?.merged.replacedEntryIds ?? [])}
        showErrors={showErrors}
      />
      {state === 'error' && <Alert tone="error">L’enregistrement a échoué. Vérifiez votre connexion puis réessayez.</Alert>}
      <StepNav isFirst={isFirst} isLast={isLast} onBack={onBack} onSkip={onDone} onSubmit={submit} state={state} />
    </div>
  )
}

export function BudgetPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const mode = params.get('mode') === 'hors-releves' ? 'hors-releves' : 'standard'
  const index = Math.max(0, STEPS.findIndex((s) => s.id === params.get('etape')))
  const step = STEPS[index]
  useDocumentTitle(mode === 'hors-releves' ? 'Revenus hors relevés' : step.title)

  const goTo = (i: number) => {
    const next = new URLSearchParams(params)
    next.set('etape', STEPS[i].id)
    setParams(next)
    window.scrollTo({ top: 0 })
  }
  const finish = () => navigate('/app')
  const done = () => (mode === 'hors-releves' || index === STEPS.length - 1 ? finish() : goTo(index + 1))

  return (
    <Container className="max-w-2xl py-8 sm:py-12">
      {mode === 'standard' ? (
        <Stepper current={index} onSelect={goTo} />
      ) : (
        <Link to="/app/releves" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Mes relevés
        </Link>
      )}
      <div className="mt-6 mb-6">
        <p className="text-sm font-medium text-primary">{mode === 'standard' ? `Étape ${index + 1} sur ${STEPS.length}` : 'Compléter mes relevés'}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{mode === 'hors-releves' ? 'Revenus absents de vos relevés' : step.title}</h1>
        <p className="mt-2 text-muted-foreground">{mode === 'hors-releves' ? 'Facultatif : passez cette étape si tous vos revenus figurent sur vos relevés.' : step.intro}</p>
      </div>

      {step.id === 'situation' && mode === 'standard' ? (
        <SituationForm onDone={finish} onBack={() => goTo(index - 1)} />
      ) : (
        <StepEditor
          key={`${step.id}-${mode}`}
          step={mode === 'hors-releves' ? STEPS[0] : step}
          mode={mode}
          onDone={done}
          onBack={() => goTo(index - 1)}
          isFirst={index === 0 || mode === 'hors-releves'}
          isLast={mode === 'hors-releves'}
        />
      )}
    </Container>
  )
}
