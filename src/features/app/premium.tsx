// Accès aux fonctionnalités Premium. L'affichage suit les droits renvoyés par
// le serveur ; les limites sont de toute façon appliquées côté base et dans
// les Edge Functions, quoi que l'interface affiche.
import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatEuros } from '@/domain'
import { usePublicPlans } from '@/features/finance/billing'
import { useFeature, type BooleanFeature } from '@/features/finance/use-entitlement'
import { cn } from '@/lib/utils'

/** Encart d'incitation à passer à Premium, sobre et sans pression. */
export function UpgradeCard({ title, children, className, compact }: { title: string; children?: ReactNode; className?: string; compact?: boolean }) {
  const premium = usePublicPlans().find((p) => p.monthly_price_cents > 0)
  return (
    <Card className={cn('border-primary/30 bg-primary-soft/40', compact ? 'p-4' : 'p-5 sm:p-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-semibold">{title}</p>
            {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/app/abonnement">{premium ? `Découvrir Premium · ${formatEuros(premium.monthly_price_cents)}/mois` : 'Découvrir Premium'}</Link>
        </Button>
      </div>
    </Card>
  )
}

/** Affiche le contenu si le droit est accordé, sinon l'encart Premium. */
export function PremiumGate({ feature, title, description, children }: { feature: BooleanFeature; title: string; description?: ReactNode; children: ReactNode }) {
  const allowed = useFeature(feature)
  if (allowed === undefined) return null
  if (allowed) return <>{children}</>
  return <UpgradeCard title={title}>{description}</UpgradeCard>
}
