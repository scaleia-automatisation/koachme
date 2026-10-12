import { Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WITHDRAWAL_DAYS, yearlyMonthsFree } from '@/config/plans'
import { usePublicPlans } from '@/features/finance/billing'
import { useAuth } from '@/lib/use-auth'
import { formatEuros } from '@/domain'
import { cn } from '@/lib/utils'
import { CallToAction, PageHero } from './page-parts'

type Billing = 'monthly' | 'yearly'

export function PricingPage() {
  const [billing, setBilling] = useState<Billing>('monthly')
  const plans = usePublicPlans()
  const { user } = useAuth()
  const monthsFree = Math.max(0, ...plans.map(yearlyMonthsFree))

  return (
    <>
      <PageHero
        eyebrow="Tarifs"
        title="Commencez gratuitement, évoluez quand vous le souhaitez"
        intro="Votre premier bilan est gratuit, sans carte bancaire. Les offres payantes sont sans engagement et résiliables en quelques clics."
      />
      <Container className="py-14 sm:py-20">
        <div className="flex justify-center">
          <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(['monthly', 'yearly'] as const).map((b) => (
              <button
                key={b}
                role="radio"
                aria-checked={billing === b}
                onClick={() => setBilling(b)}
                className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', billing === b ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {b === 'monthly' ? 'Mensuel' : monthsFree > 0 ? `Annuel · ${monthsFree} mois offerts` : 'Annuel'}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
          {plans.map((plan) => {
            const yearly = billing === 'yearly' && plan.yearly_price_cents !== null
            const price = yearly ? plan.yearly_price_cents! : plan.monthly_price_cents
            return (
              <Card key={plan.id} className={cn('flex flex-col p-6 sm:p-8', plan.highlighted && 'border-primary ring-1 ring-primary')}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  {plan.highlighted && <Badge tone="primary">Recommandé</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="tabular text-4xl font-semibold tracking-tight">{price === 0 ? '0 €' : formatEuros(price)}</span>
                  <span className="text-sm text-muted-foreground">{price === 0 ? 'pour toujours' : yearly ? '/ an' : '/ mois'}</span>
                </p>
                {yearly && <p className="mt-1 text-xs text-muted-foreground">soit {formatEuros(Math.round(price / 12))} par mois</p>}
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-8 w-full" variant={plan.highlighted ? 'primary' : 'outline'}>
                  <Link to={user ? '/app/abonnement' : '/inscription'}>
                    {plan.monthly_price_cents === 0 ? (user ? 'Voir mon offre' : 'Commencer gratuitement') : user ? `Passer à ${plan.name}` : 'Commencer par le bilan gratuit'}
                  </Link>
                </Button>
              </Card>
            )
          })}
        </div>

        <div className="mx-auto mt-12 max-w-3xl space-y-2 text-center text-sm text-muted-foreground">
          <p>Prix TTC. Abonnement sans engagement, résiliable à tout moment depuis votre espace : il reste actif jusqu’à la fin de la période payée.</p>
          <p>
            Vous disposez d’un délai de rétractation de {WITHDRAWAL_DAYS} jours.{' '}
            <Link to="/abonnement-resiliation" className="font-medium text-primary underline-offset-4 hover:underline">
              Tout savoir sur l’abonnement et la résiliation
            </Link>
          </p>
        </div>
      </Container>
      <CallToAction />
    </>
  )
}
