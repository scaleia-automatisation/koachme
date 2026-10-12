// « Mon bilan » : page d'accueil de l'espace connecté. L'essentiel en un coup
// d'œil — période, complétude, revenus, dépenses, reste, statut, trois points
// à retenir et trois actions prioritaires — puis le détail sur demande.
// Tous les chiffres proviennent du moteur déterministe (src/domain).
import { ChevronDown, FileUp, MessageCircle, PencilLine, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status-badge'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/form-controls'
import { RELIABILITY_LABELS, buildSnapshot, formatEuros, periodOf, type KeyPoint } from '@/domain'
import { useMonthlyReports, useProfile, useSaveMonthlyReport, useUpdateProfile } from '@/features/finance/api'
import { useAnalysis } from '@/features/finance/use-analysis'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { AccountsPosition, FindingCard, ReliabilityCard, SeparatedMovements } from './bilan-sections'
import { formatPeriod, reportTitle } from './import-meta'
import { COACH_SUGGESTIONS } from './coach-suggestions'
import { useFeature } from '@/features/finance/use-entitlement'
import { UpgradeCard } from './premium'
import { RecommendationCard } from './recommendation-card'

const POINT_DOT: Record<KeyPoint['tone'], string> = {
  positive: 'bg-success',
  neutral: 'bg-primary',
  warning: 'bg-warning',
  negative: 'bg-danger',
}

function UpdateMenu({ onRefresh }: { onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <RefreshCw aria-hidden /> Mettre à jour mon bilan <ChevronDown aria-hidden />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
          <Link role="menuitem" to="/app/releves" className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted">
            <FileUp className="size-4 text-primary" aria-hidden /> Importer un nouveau relevé
          </Link>
          <Link role="menuitem" to="/app/budget?etape=revenus" className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted">
            <PencilLine className="size-4 text-primary" aria-hidden /> Modifier mes montants
          </Link>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false)
              onRefresh()
            }}
          >
            <RefreshCw className="size-4 text-primary" aria-hidden /> Refaire l’analyse
          </button>
        </div>
      )}
    </div>
  )
}

export function BilanPage() {
  useDocumentTitle('Mon bilan')
  const navigate = useNavigate()
  const profile = useProfile()
  const updateProfile = useUpdateProfile()
  const analysis = useAnalysis()
  const reports = useMonthlyReports()
  const saveReport = useSaveMonthlyReport()
  const [showDetails, setShowDetails] = useState(false)
  const advanced = useFeature('advanced_recommendations')
  const data = analysis.data

  // Le premier bilan affiché marque la fin de l'onboarding.
  const shouldComplete = !!data?.hasData && !!profile.data && !profile.data.onboarding_completed_at
  useEffect(() => {
    if (shouldComplete && !updateProfile.isPending)
      updateProfile.mutate({
        onboarding_completed_at: new Date().toISOString(),
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldComplete])

  // Suivi mensuel : l'instantané du mois en cours est enregistré (et mis à jour si les chiffres changent).
  const today = new Date().toISOString().slice(0, 10)
  const period = periodOf(today)
  const snapshot = data?.hasData ? buildSnapshot(data, data.situation, period, today) : null
  const fingerprint = snapshot ? JSON.stringify({ ...snapshot, generatedAt: null }) : null
  const lastSaved = useRef<string | null>(null)
  useEffect(() => {
    if (!snapshot || !fingerprint || !reports.data || lastSaved.current === fingerprint) return
    const existing = reports.data.find((r) => r.period === period)
    lastSaved.current = fingerprint
    if (existing && JSON.stringify({ ...existing.snapshot, generatedAt: null }) === fingerprint) return
    saveReport.mutate({ period, snapshot })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, reports.data])

  if (profile.data && !profile.data.onboarding_path) return <Navigate to="/app/bienvenue" replace />
  if (analysis.isLoading || profile.isLoading) return <LoadingState label="Calcul de votre bilan…" className="py-24" />
  if (analysis.error || !data) return <ErrorState onRetry={analysis.refetch} className="py-24" />

  if (!data.hasData) {
    const processing = data.imports.some((i) => i.status === 'uploaded' || i.status === 'processing')
    return (
      <Container className="max-w-2xl py-12">
        <Card>
          <EmptyState
            icon={processing ? RefreshCw : FileUp}
            title={processing ? 'Votre relevé est en cours d’analyse' : 'Votre bilan vous attend'}
            description={
              processing
                ? 'Cela prend généralement moins d’une minute. Vous pourrez ensuite vérifier les opérations.'
                : data.excludedImports.length
                  ? 'Votre relevé présente un écart avec ses soldes : vérifiez-le pour qu’il soit pris en compte.'
                  : 'Importez un relevé ou renseignez vos revenus et vos dépenses pour obtenir votre premier bilan.'
            }
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link to="/app/releves">
                    <FileUp aria-hidden /> {processing || data.excludedImports.length ? 'Voir mes relevés' : 'Importer un relevé'}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/app/budget?etape=revenus">
                    <PencilLine aria-hidden /> Saisir mes montants
                  </Link>
                </Button>
              </div>
            }
          />
        </Card>
      </Container>
    )
  }

  const { summary, diagnosis, completeness, figures } = data
  const periodText = figures.period ? `Relevés ${formatPeriod(figures.period.start, figures.period.end)}` : 'Montants que vous avez déclarés (moyenne mensuelle)'
  const previousPeriod = periodOf(new Date(Date.parse(`${period}-01T00:00:00Z`) - 86_400_000).toISOString())
  const previousReport = reports.data?.find((r) => r.period === previousPeriod)
  const lastStatementEnd = figures.period?.end
  const stale = profile.data?.notify_monthly_reminder !== false && lastStatementEnd && Date.parse(today) - Date.parse(lastStatementEnd) > 35 * 86_400_000
  const toReview = data.imports.filter((i) => i.status === 'needs_review' && i.balance_check !== 'mismatch')
  const handled = data.recommendations.filter((r) => r.status === 'done' || r.status === 'dismissed')
  // Offre Découverte : recommandations essentielles (alertes urgentes, sinon la plus utile) ; les autres sont réservées à Premium.
  const urgent = data.priorities.filter((r) => r.priority === 1)
  const priorities = advanced === false ? (urgent.length ? urgent : data.priorities.slice(0, 1)) : data.priorities
  const lockedCount = advanced === false ? data.recommendations.filter((r) => (r.status === 'todo' || r.status === 'in_progress') && !priorities.some((p) => p.key === r.key)).length : 0

  return (
    <Container className="space-y-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mon bilan</h1>
          <p className="mt-1 text-sm text-muted-foreground">{periodText}</p>
        </div>
        <UpdateMenu onRefresh={analysis.refetch} />
      </div>

      {stale && (
        <Alert tone="info">
          <p className="font-medium">C’est le moment de mettre à jour votre bilan</p>
          <p className="text-muted-foreground">Votre dernier relevé s’arrête il y a plus d’un mois. Importez le relevé du mois écoulé pour suivre votre progression.</p>
          <Link to="/app/releves" className="font-medium text-primary underline-offset-4 hover:underline">
            Importer mon relevé →
          </Link>
        </Alert>
      )}
      {data.excludedImports.map((imp) => (
        <Alert key={imp.id} tone="error">
          <p className="font-medium">Relevé « {imp.account_label ?? imp.file_name} » non pris en compte (écart de solde)</p>
          <Link to={`/app/releves/${imp.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Vérifier ce relevé →
          </Link>
        </Alert>
      ))}
      {toReview.length > 0 && data.pendingReviewCount > 0 && (
        <Alert tone="info">
          <p className="font-medium">
            {data.pendingReviewCount} opération
            {data.pendingReviewCount > 1 ? 's' : ''} à confirmer
          </p>
          <Link to={`/app/releves/${toReview[0].id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Vérifier mon relevé →
          </Link>
        </Alert>
      )}

      {/* Synthèse */}
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={diagnosis.status} />
          <div className="flex min-w-48 flex-1 items-center justify-end gap-3 sm:flex-none">
            <span className="text-xs text-muted-foreground">Complétude</span>
            <Progress
              value={completeness.score}
              label="Complétude du bilan"
              className="w-24"
              tone={completeness.reliability === 'low' ? 'danger' : completeness.reliability === 'high' ? 'success' : 'primary'}
            />
            <Badge tone={completeness.reliability === 'high' ? 'success' : completeness.reliability === 'medium' ? 'warning' : 'danger'}>
              {completeness.score}/100 · {RELIABILITY_LABELS[completeness.reliability].replace('Fiabilité ', '')}
            </Badge>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted p-4">
            <dt className="text-sm text-muted-foreground">Revenus mensuels</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{formatEuros(summary.income)}</dd>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <dt className="text-sm text-muted-foreground">Dépenses mensuelles</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{formatEuros(summary.expenses)}</dd>
          </div>
          <div className={cn('rounded-xl p-4', summary.balance < 0 ? 'bg-danger-soft' : 'bg-primary-soft')}>
            <dt className="text-sm text-muted-foreground">Reste budgétaire estimé</dt>
            <dd className={cn('tabular mt-1 text-2xl font-semibold', summary.balance < 0 && 'text-danger')}>{formatEuros(summary.balance)}</dd>
            <dd className="text-xs text-muted-foreground">après {formatEuros(summary.savings)} d’épargne · pas un solde</dd>
          </div>
        </dl>
        <div className="mt-5">
          <FindingCard finding={diagnosis.headline} primary />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Trois points à retenir */}
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">À retenir</h2>
          <ul className="mt-4 space-y-3">
            {data.keyPoints.map((p) => (
              <li key={p.text} className="flex gap-3 text-sm">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', POINT_DOT[p.tone])} aria-hidden />
                {p.text}
              </li>
            ))}
          </ul>
          {previousReport && (
            <Link to={`/app/progression/${previousPeriod}`} className="mt-5 flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-sm hover:bg-border">
              <span>Votre {reportTitle(previousPeriod).toLowerCase()}</span>
              <span className="font-medium text-primary">Voir →</span>
            </Link>
          )}

          {/* Accès direct au coach */}
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" aria-hidden /> Une question sur votre budget ?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COACH_SUGGESTIONS.slice(0, 3).map((q) => (
                <button
                  key={q}
                  onClick={() => navigate('/app/coach', { state: { question: q } })}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-left text-xs hover:border-primary/40"
                >
                  {q}
                </button>
              ))}
            </div>
            <Button asChild size="sm" className="mt-3">
              <Link to="/app/coach">
                <MessageCircle aria-hidden /> Parler au coach IA
              </Link>
            </Button>
          </div>
        </Card>

        {/* Trois actions prioritaires */}
        <section aria-labelledby="priorites">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="priorites" className="font-semibold">
              Vos {priorities.length > 1 ? `${priorities.length} actions prioritaires` : 'action prioritaire'}
            </h2>
            {data.confirmedSavings > 0 && <span className="text-sm text-success">Économies confirmées : {formatEuros(data.confirmedSavings)} / mois</span>}
          </div>
          <div className="mt-4 space-y-3">
            {priorities.length ? (
              priorities.map((r, i) => <RecommendationCard key={r.key} rec={r} index={i} compact />)
            ) : (
              <Card className="p-5 text-sm text-muted-foreground">Aucune action prioritaire pour le moment : toutes les recommandations sont traitées.</Card>
            )}
            {lockedCount > 0 && (
              <UpgradeCard compact title={`${lockedCount} recommandation${lockedCount > 1 ? 's' : ''} avancée${lockedCount > 1 ? 's' : ''} disponible${lockedCount > 1 ? 's' : ''} avec Premium`}>
                Optimisation de vos abonnements, de vos frais et de votre épargne, chiffrée à partir de vos relevés.
              </UpgradeCard>
            )}
          </div>
          {handled.length > 0 && (
            <details className="group mt-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
                Actions réalisées ou écartées ({handled.length}) — indiquer une économie constatée
              </summary>
              <div className="mt-3 space-y-3">
                {handled.map((r) => (
                  <RecommendationCard key={r.key} rec={r} compact />
                ))}
              </div>
            </details>
          )}
        </section>
      </div>

      <div>
        <Button variant="ghost" onClick={() => setShowDetails((s) => !s)} aria-expanded={showDetails}>
          <ChevronDown className={cn('transition-transform', showDetails && 'rotate-180')} aria-hidden />
          {showDetails ? 'Masquer le détail' : 'Voir le détail du bilan'}
        </Button>
        {showDetails && (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              {diagnosis.findings.length > 1 && (
                <Card className="space-y-3 p-5">
                  <h2 className="font-semibold">Tous les points d’attention</h2>
                  {diagnosis.findings.map((f) => (
                    <FindingCard key={f.code} finding={f} />
                  ))}
                </Card>
              )}
              <AccountsPosition a={data} />
              <SeparatedMovements a={data} />
            </div>
            <ReliabilityCard a={data} />
          </div>
        )}
      </div>
    </Container>
  )
}
