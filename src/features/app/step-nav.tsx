import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button, type ButtonState } from '@/components/ui/button'

export function StepNav({ isFirst, isLast, onBack, onSkip, onSubmit, state }: { isFirst: boolean; isLast: boolean; onBack: () => void; onSkip: () => void; onSubmit: () => void; state: ButtonState }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        {!isFirst && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft aria-hidden />
            Précédent
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          Passer cette étape
        </Button>
      </div>
      <Button onClick={onSubmit} state={state} loadingText="Enregistrement…" successText="Enregistré" errorText="Réessayer" size="lg">
        {isLast ? (
          <>
            <Check aria-hidden />
            Voir mon bilan
          </>
        ) : (
          <>
            Enregistrer et continuer
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>
    </div>
  )
}
