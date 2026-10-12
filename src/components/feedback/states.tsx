// États génériques d'un écran : chargement, absence de données, erreur.
import { AlertCircle, CheckCircle2, Info, Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LoadingState({ label = 'Chargement…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground', className)}>
      <Loader2 className="size-6 animate-spin-fast text-primary" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  )
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** Niveau de titre quand l'état occupe toute la page (ex. page introuvable). */
  heading?: 'h1' | 'h2'
}

export function EmptyState({ icon: Icon, title, description, action, className, heading }: EmptyStateProps) {
  const Title = heading ?? 'p'
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <Title className="font-semibold">{title}</Title>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
  heading?: 'h1' | 'h2'
}

export function ErrorState({
  title = 'Une erreur est survenue',
  description = 'Vérifiez votre connexion puis réessayez.',
  onRetry,
  className,
  heading,
}: ErrorStateProps) {
  const Title = heading ?? 'p'
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertCircle className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <Title className="font-semibold">{title}</Title>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Réessayer
        </Button>
      )}
    </div>
  )
}

const ALERT_STYLE = {
  info: { Icon: Info, className: 'border-primary/20 bg-primary-soft text-primary' },
  success: { Icon: CheckCircle2, className: 'border-success/20 bg-success-soft text-success' },
  error: { Icon: AlertCircle, className: 'border-danger/20 bg-danger-soft text-danger' },
} as const

export function Alert({ tone = 'info', children, className }: { tone?: keyof typeof ALERT_STYLE; children: ReactNode; className?: string }) {
  const { Icon, className: toneClass } = ALERT_STYLE[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm', toneClass, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-foreground">{children}</div>
    </div>
  )
}
