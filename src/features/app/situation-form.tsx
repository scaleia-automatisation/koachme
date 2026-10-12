import { useState } from 'react'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { type ButtonState } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/form-controls'
import { GOAL_LABELS, parseEuros, type FinancialGoal, type FinancialSituation } from '@/domain'
import { useSaveSituation, useSituation } from '@/features/finance/api'
import { cn } from '@/lib/utils'
import { StepNav } from './step-nav'

const toText = (cents: number | null) => (cents === null ? '' : (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ /g, ' '))

interface FormState {
  savings: string
  debt: string
  delays: 'yes' | 'no' | ''
  goal: FinancialGoal | ''
  household: string
}

function toForm(s: FinancialSituation | null): FormState {
  return {
    savings: toText(s?.savingsAvailable ?? null),
    debt: toText(s?.debtRemaining ?? null),
    delays: s?.hasPaymentDelays === true ? 'yes' : s?.hasPaymentDelays === false ? 'no' : '',
    goal: s?.mainGoal ?? '',
    household: s?.householdSize ? String(s.householdSize) : '',
  }
}

export function SituationForm({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const situation = useSituation()
  if (situation.isLoading) return <LoadingState />
  if (situation.error || situation.data === undefined) return <ErrorState onRetry={() => void situation.refetch()} />
  return <SituationFields initial={toForm(situation.data)} onDone={onDone} onBack={onBack} />
}

function SituationFields({ initial, onDone, onBack }: { initial: FormState; onDone: () => void; onBack: () => void }) {
  const save = useSaveSituation()
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<{ savings?: string; debt?: string }>({})
  const [state, setState] = useState<ButtonState>('idle')

  const amount = (text: string) => (text.trim() ? parseEuros(text) : null)

  const submit = async () => {
    const next: typeof errors = {}
    const savings = amount(form.savings)
    const debt = amount(form.debt)
    if (form.savings.trim() && (savings === null || savings < 0)) next.savings = 'Montant invalide'
    if (form.debt.trim() && (debt === null || debt < 0)) next.debt = 'Montant invalide'
    setErrors(next)
    if (Object.keys(next).length) return
    const payload: FinancialSituation = {
      savingsAvailable: savings,
      debtRemaining: debt,
      hasPaymentDelays: form.delays === '' ? null : form.delays === 'yes',
      mainGoal: form.goal || null,
      householdSize: form.household ? Number(form.household) : null,
    }
    setState('loading')
    try {
      await save.mutateAsync(payload)
      setState('success')
      setTimeout(onDone, 350)
    } catch {
      setState('error')
    }
  }

  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Épargne disponible" hint="Livrets, compte épargne… si vous le savez." error={errors.savings}>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <Input id={id} inputMode="decimal" placeholder="Je ne sais pas" className="tabular pr-8" value={form.savings} onChange={(e) => setForm({ ...form, savings: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">€</span>
            </div>
          )}
        </Field>
        <Field label="Dettes restant à rembourser" hint="Total des crédits en cours, hors crédit immobilier." error={errors.debt}>
          {({ id, describedBy, invalid }) => (
            <div className="relative">
              <Input id={id} inputMode="decimal" placeholder="0 si aucune" className="tabular pr-8" value={form.debt} onChange={(e) => setForm({ ...form, debt: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">€</span>
            </div>
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Avez-vous des retards de paiement en ce moment ?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {([['no', 'Non'], ['yes', 'Oui'], ['', 'Je préfère ne pas répondre']] as const).map(([value, label]) => (
            <label key={label} className={cn('cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors', form.delays === value ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border bg-surface hover:bg-muted')}>
              <input type="radio" name="delays" className="sr-only" checked={form.delays === value} onChange={() => setForm({ ...form, delays: value })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Votre objectif prioritaire</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.keys(GOAL_LABELS) as FinancialGoal[]).map((goal) => (
            <label key={goal} className={cn('cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors', form.goal === goal ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border bg-surface hover:bg-muted')}>
              <input type="radio" name="goal" className="sr-only" checked={form.goal === goal} onChange={() => setForm({ ...form, goal })} />
              {GOAL_LABELS[goal]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Nombre de personnes dans le foyer" className="max-w-xs">
        {({ id }) => (
          <Select id={id} value={form.household} onChange={(e) => setForm({ ...form, household: e.target.value })}>
            <option value="">Non précisé</option>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 8 ? '8 ou plus' : n}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {state === 'error' && <Alert tone="error">L’enregistrement a échoué. Vérifiez votre connexion puis réessayez.</Alert>}
      <StepNav isFirst={false} isLast onBack={onBack} onSkip={onDone} onSubmit={submit} state={state} />
    </div>
  )
}
