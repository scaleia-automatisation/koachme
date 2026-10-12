// « Mon abonnement » : offre actuelle, consommation, souscription, gestion et factures.
// Le statut affiché vient exclusivement du serveur (abonnements écrits par le
// webhook Stripe signé). Le retour de paiement (?paiement=retour) ne prouve
// rien : on attend que le serveur confirme l'abonnement.
import { Check, CreditCard, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Progress } from '@/components/ui/form-controls'
import { WITHDRAWAL_DAYS, yearlyMonthsFree } from '@/config/plans'
import { formatEuros } from '@/domain'
import { useQueryClient } from '@tanstack/react-query'
import { billingKeys, useCheckout, useEntitlements, usePayments, usePortal, usePublicPlans, type Entitlements, type Payment } from '@/features/finance/billing'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { formatDate } from './import-meta'

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Actif', tone: 'success' },
  trialing: { label: 'Période d’essai', tone: 'success' },
  past_due: { label: 'Paiement en attente', tone: 'warning' },
  unpaid: { label: 'Impayé', tone: 'danger' },
  canceled: { label: 'Résilié', tone: 'neutral' },
  incomplete: { label: 'Paiement non finalisé', tone: 'warning' },
  incomplete_expired: { label: 'Paiement expiré', tone: 'neutral' },
  paused: { label: 'En pause', tone: 'neutral' },
}

const PAYMENT_LABEL: Record<Payment['status'], string> = {
  paid: 'Payée',
  open: 'En attente',
  failed: 'Échec',
  refunded: 'Remboursée',
  partially_refunded: 'Remboursée en partie',
  void: 'Annulée',
}

const CHECKOUT_ERRORS: Record<string, string> = {
  billing_not_configured: 'Le paiement en ligne n’est pas encore ouvert. Vous serez prévenu dès qu’il sera disponible.',
  already_subscribed: 'Vous bénéficiez déjà de cette offre.',
  rate_limited: 'Trop de tentatives. Patientez quelques minutes puis réessayez.',
  no_customer: 'Aucun abonnement n’est associé à votre compte.',
  nothing_to_cancel: 'Aucun abonnement en cours à résilier.',
}

function errorMessage(err: unknown) {
  const code = (err as { code?: string } | null)?.code
  return (code && CHECKOUT_ERRORS[code]) || 'Le paiement n’a pas pu être initialisé. Réessayez dans un instant.'
}

/** Après un retour de paiement, interroge le serveur jusqu'à confirmation (90 s max). */
function useAwaitConfirmation(waiting: boolean, ent: ReturnType<typeof useEntitlements>) {
  const [timedOut, setTimedOut] = useState(false)
  const confirmed = ent.data ? ent.data.plan !== 'free' : false
  useEffect(() => {
    if (!waiting || confirmed) return
    const started = Date.now()
    const id = window.setInterval(() => {
      if (Date.now() - started > 90_000) {
        setTimedOut(true)
        window.clearInterval(id)
      } else void ent.refetch()
    }, 3000)
    return () => window.clearInterval(id)
  }, [waiting, confirmed, ent])
  return { confirmed, timedOut }
}

function UsageMeter({ label, used, max }: { label: string; used: number; max: number | null }) {
  if (max === 0) return null
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular text-muted-foreground">{max === null ? `${used} · sans limite` : `${used} / ${max}`}</span>
      </div>
      {max !== null && <Progress className="mt-1.5" value={Math.min(100, (used / max) * 100)} label={label} tone={used >= max ? 'danger' : 'primary'} />}
    </div>
  )
}

function CurrentPlan({ ent }: { ent: Entitlements }) {
  const portal = usePortal()
  const sub = ent.subscription
  const status = sub ? STATUS_LABEL[sub.status] : null
  const isPaid = ent.plan !== 'free'
  const canCancel = !!sub && ['active', 'trialing', 'past_due'].includes(sub.status) && !sub.cancel_at_period_end
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Offre {ent.plan_name}</CardTitle>
          {isPaid && status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="success">Gratuite</Badge>}
        </div>
        {isPaid && sub && (
          <CardDescription>
            Formule {sub.interval === 'year' ? 'annuelle' : 'mensuelle'}
            {sub.current_period_end &&
              (sub.cancel_at_period_end || sub.status === 'canceled'
                ? ` · accès Premium jusqu’au ${formatDate(sub.current_period_end)}, sans renouvellement`
                : ` · prochain renouvellement le ${formatDate(sub.current_period_end)}`)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {sub?.status === 'past_due' && (
          <Alert tone="error">
            Votre dernier paiement n’a pas abouti. Votre accès est maintenu pendant les nouvelles tentatives : mettez à jour votre moyen de paiement pour
            éviter l’interruption.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <UsageMeter label="Relevés analysés ce mois-ci" used={ent.usage.statement_imports_this_month} max={ent.limits.statement_imports_per_month} />
          <UsageMeter label="Objectifs d’épargne" used={ent.usage.goals} max={ent.limits.max_goals} />
          <UsageMeter label="Questions au coach ce mois-ci" used={ent.usage.coach_questions_this_month} max={ent.limits.coach_questions_per_month} />
          <UsageMeter label="Exports PDF ce mois-ci" used={ent.usage.pdf_exports_this_month} max={ent.limits.pdf_exports_per_month} />
        </div>
        {(isPaid || sub) && (
          <div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => portal.mutate('manage')} state={portal.isPending && portal.variables === 'manage' ? 'loading' : 'idle'} loadingText="Ouverture…">
                <CreditCard aria-hidden /> Gérer mon abonnement
              </Button>
              {canCancel && (
                <Button variant="ghost" className="text-danger" onClick={() => portal.mutate('cancel')} state={portal.isPending && portal.variables === 'cancel' ? 'loading' : 'idle'} loadingText="Ouverture…">
                  Résilier mon abonnement
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Moyen de paiement, formule mensuelle ou annuelle, résiliation : tout se fait dans l’espace sécurisé de notre prestataire de paiement.
            </p>
            {portal.isError && <Alert tone="error" className="mt-3">{errorMessage(portal.error)}</Alert>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UpgradeOffer() {
  const plans = usePublicPlans()
  const premium = plans.find((p) => p.monthly_price_cents > 0)
  const checkout = useCheckout()
  const [immediate, setImmediate] = useState(false)
  const [interval, setBillingInterval] = useState<'month' | 'year'>('month')
  if (!premium) return null
  const yearly = interval === 'year' && premium.yearly_price_cents !== null
  const price = yearly ? premium.yearly_price_cents! : premium.monthly_price_cents
  const monthsFree = yearlyMonthsFree(premium)
  return (
    <Card className="border-primary ring-1 ring-primary">
      <CardHeader>
        <CardTitle>Passer à {premium.name}</CardTitle>
        <CardDescription>{premium.tagline}</CardDescription>
      </CardHeader>
      <CardContent>
        {premium.yearly_price_cents !== null && (
          <div role="radiogroup" aria-label="Formule" className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(['month', 'year'] as const).map((i) => (
              <button
                key={i}
                role="radio"
                aria-checked={interval === i}
                onClick={() => setBillingInterval(i)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', interval === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {i === 'month' ? 'Mensuel' : monthsFree > 0 ? `Annuel · ${monthsFree} mois offerts` : 'Annuel'}
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 flex items-baseline gap-1">
          <span className="tabular text-3xl font-semibold tracking-tight">{formatEuros(price)}</span>
          <span className="text-sm text-muted-foreground">{yearly ? '/ an' : '/ mois'} TTC</span>
        </p>
        {yearly && <p className="text-xs text-muted-foreground">soit {formatEuros(Math.round(price / 12))} par mois</p>}
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {premium.features.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {f}
            </li>
          ))}
        </ul>
        <label className="mt-6 flex items-start gap-2.5 text-sm">
          <Checkbox checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
          <span>
            Je demande à bénéficier de Premium dès maintenant. Je reconnais qu’en cas de rétractation dans les {WITHDRAWAL_DAYS} jours, le montant
            correspondant à la période déjà utilisée pourra être retenu.
          </span>
        </label>
        <Button className="mt-4 w-full sm:w-auto" disabled={!immediate} onClick={() => checkout.mutate(interval)} state={checkout.isPending ? 'loading' : 'idle'} loadingText="Redirection vers le paiement…">
          Souscrire · {formatEuros(price)} {yearly ? 'par an' : 'par mois'}
        </Button>
        {checkout.isError && <Alert tone="error" className="mt-3">{errorMessage(checkout.error)}</Alert>}
        <p className="mt-3 text-xs text-muted-foreground">
          Sans engagement, résiliable à tout moment. Paiement sécurisé par notre prestataire : nous ne voyons jamais votre numéro de carte. Délai de
          rétractation de {WITHDRAWAL_DAYS} jours.{' '}
          <Link to="/abonnement-resiliation" className="font-medium text-primary hover:underline">
            Conditions
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

function Invoices() {
  const payments = usePayments()
  if (payments.isLoading) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Factures</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.error ? (
          <ErrorState onRetry={() => void payments.refetch()} />
        ) : !payments.data?.length ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" aria-hidden /> Aucune facture pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{formatDate(p.period_start ?? p.created_at)}</p>
                  <p className="text-muted-foreground">
                    {formatEuros(p.amount_cents)} · {PAYMENT_LABEL[p.status]}
                    {p.refunded_cents > 0 && ` (${formatEuros(p.refunded_cents)} remboursés)`}
                  </p>
                </div>
                {(p.invoice_pdf_url || p.hosted_invoice_url) && (
                  <a href={(p.invoice_pdf_url ?? p.hosted_invoice_url)!} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    Télécharger <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function SubscriptionPage() {
  useDocumentTitle('Mon abonnement')
  const ent = useEntitlements()
  const [params, setParams] = useSearchParams()
  const returned = params.get('paiement') === 'retour'
  const canceled = params.get('paiement') === 'annule'
  const terminated = params.get('resiliation') === '1'
  const { confirmed, timedOut } = useAwaitConfirmation(returned, ent)
  const qc = useQueryClient()
  // Paiement confirmé : la première facture est arrivée avec le webhook.
  useEffect(() => {
    if (returned && confirmed) void qc.invalidateQueries({ queryKey: billingKeys.payments })
  }, [returned, confirmed, qc])

  if (ent.isLoading) return <LoadingState className="py-24" />
  if (ent.error || !ent.data) return <ErrorState onRetry={() => void ent.refetch()} className="py-24" />

  return (
    <Container className="max-w-3xl space-y-6 py-8 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mon abonnement</h1>
        <p className="mt-1 text-muted-foreground">Votre offre, votre consommation du mois et vos factures.</p>
      </div>

      {returned &&
        (confirmed ? (
          <Alert tone="success">Paiement confirmé : votre offre {ent.data.plan_name} est active. Merci !</Alert>
        ) : timedOut ? (
          <Alert tone="info">
            Nous n’avons pas encore reçu la confirmation de votre paiement. Elle arrive généralement en quelques minutes ; si votre offre n’est pas
            activée d’ici une heure, <Link to="/contact" className="font-medium underline">contactez-nous</Link>.
          </Alert>
        ) : (
          <div role="status" className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Confirmation de votre paiement en cours auprès de notre prestataire…
          </div>
        ))}
      {terminated && (
        <Alert tone="info">
          Votre demande de résiliation est prise en compte par notre prestataire de paiement. Elle apparaît ici dès sa confirmation : vous gardez
          l’accès Premium jusqu’à la fin de la période déjà payée, sans nouveau prélèvement.
        </Alert>
      )}
      {canceled && (
        <Alert tone="info">
          Paiement annulé : aucun montant n’a été prélevé.{' '}
          <button className="font-medium underline" onClick={() => setParams({}, { replace: true })}>
            Fermer
          </button>
        </Alert>
      )}

      <CurrentPlan ent={ent.data} />
      {ent.data.plan === 'free' && <UpgradeOffer />}
      <Invoices />
    </Container>
  )
}
