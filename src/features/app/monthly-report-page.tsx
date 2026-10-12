// Bilan mensuel lisible, imprimable et téléchargeable en PDF (généré côté serveur, offre Premium).
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status-badge'
import { Logo } from '@/components/brand/logo'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FEATURES } from '@/config/features'
import { formatEuros, formatPercent, STATUS_META } from '@/domain'
import { useMonthlyReports } from '@/features/finance/api'
import { billingKeys, downloadReportPdf } from '@/features/finance/billing'
import { useDocumentTitle } from '@/lib/use-document-title'
import { formatPeriod, reportTitle } from './import-meta'
import { PremiumGate } from './premium'

const SOURCE: Record<string, string> = {
  statements: 'constaté sur vos relevés',
  declared: 'déclaré',
  mixed: 'relevés et déclarations',
  none: 'non renseigné',
}

export function MonthlyReportPage() {
  const { period = '' } = useParams()
  useDocumentTitle(/^\d{4}-\d{2}$/.test(period) ? reportTitle(period) : 'Bilan mensuel')
  return (
    <PremiumGate
      feature="monthly_history"
      title="L’historique de vos bilans mensuels est inclus dans Premium"
      description="Retrouvez chaque mois votre bilan figé, suivez votre progression et téléchargez-le en PDF."
    >
      <MonthlyReport period={period} />
    </PremiumGate>
  )
}

function PdfButton({ period }: { period: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const download = async () => {
    setLoading(true)
    setMessage(null)
    try {
      await downloadReportPdf(period)
      void qc.invalidateQueries({ queryKey: billingKeys.entitlements })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setMessage(err.code === 'plan_limit_exports' ? (err.message ?? 'Limite d’exports PDF atteinte ce mois-ci.') : 'Le PDF n’a pas pu être généré. Réessayez dans un instant.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <>
      <Button onClick={() => void download()} state={loading ? 'loading' : 'idle'} loadingText="Génération…">
        <Download aria-hidden /> Télécharger le PDF
      </Button>
      {message && (
        <Alert tone="error" className="w-full">
          {message}
        </Alert>
      )}
    </>
  )
}

function MonthlyReport({ period }: { period: string }) {
  const reports = useMonthlyReports()

  if (reports.isLoading) return <LoadingState className="py-24" />
  if (reports.error) return <ErrorState onRetry={() => void reports.refetch()} className="py-24" />
  const report = reports.data?.find((r) => r.period === period)
  if (!report) {
    return (
      <Container className="max-w-2xl py-12">
        <Card>
          <EmptyState
            icon={ArrowLeft}
            title="Bilan introuvable"
            description="Aucun bilan n’a été enregistré pour ce mois."
            action={
              <Button asChild>
                <Link to="/app/progression">Ma progression</Link>
              </Button>
            }
          />
        </Card>
      </Container>
    )
  }
  const s = report.snapshot

  return (
    <Container className="max-w-3xl py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/app/progression" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Ma progression
        </Link>
        {FEATURES.pdfExport && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden /> Imprimer
            </Button>
            <PdfButton period={period} />
          </div>
        )}
      </div>

      <article className="space-y-6 rounded-2xl border border-border bg-surface p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <Logo />
            <h1 className="mt-4 text-2xl font-semibold">{reportTitle(period)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Établi le {new Date(s.generatedAt).toLocaleDateString('fr-FR')}
              {s.sources.statementPeriod && ` · relevés ${formatPeriod(s.sources.statementPeriod.start, s.sources.statementPeriod.end)}`}
            </p>
          </div>
          <div className="text-right">
            <StatusBadge status={s.status} />
            <p className="mt-2 text-xs text-muted-foreground">Complétude {s.completenessScore}/100</p>
          </div>
        </header>

        <section>
          <h2 className="font-semibold">
            {STATUS_META[s.status].label} — {s.headline}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {s.keyPoints.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-semibold">Chiffres du mois</h2>
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                ['Revenus mensuels', formatEuros(s.income), SOURCE[s.sources.income]],
                ['Dépenses mensuelles', formatEuros(s.expenses), SOURCE[s.sources.expenses]],
                ['Épargne programmée', formatEuros(s.savings), s.savingsRate === null ? '' : `${formatPercent(s.savingsRate, 1)} des revenus`],
                ['Reste budgétaire estimé', formatEuros(s.balance), 'estimation, pas un solde'],
                ['Remboursements de crédits', formatEuros(s.debtRepayments), ''],
                ['Dettes restantes déclarées', s.debtRemaining === null ? 'non renseigné' : formatEuros(s.debtRemaining), ''],
                ['Frais bancaires identifiés', formatEuros(s.fees), ''],
                ['Économies potentielles', formatEuros(s.potentialMonthly), 'estimation, non réalisée'],
                ['Économies confirmées', formatEuros(s.confirmedSavingsMonthly), 'déclarées par vous'],
              ].map(([label, value, note]) => (
                <tr key={label}>
                  <td className="py-2">{label}</td>
                  <td className="tabular py-2 text-right font-medium">{value}</td>
                  <td className="py-2 pl-4 text-right text-xs text-muted-foreground">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {s.byGroup.length > 0 && (
          <section>
            <h2 className="font-semibold">Dépenses par catégorie</h2>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-border">
                {s.byGroup.map((g) => (
                  <tr key={g.code}>
                    <td className="py-1.5">{g.label}</td>
                    <td className="tabular py-1.5 text-right">{formatEuros(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {s.priorities.length > 0 && (
          <section>
            <h2 className="font-semibold">Priorités</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {s.priorities.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </section>
        )}

        {s.goals.length > 0 && (
          <section>
            <h2 className="font-semibold">Objectifs d’épargne</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {s.goals.map((g) => (
                <li key={g.name} className="flex justify-between">
                  <span>{g.name}</span>
                  <span className="tabular">
                    {formatEuros(g.current)} / {formatEuros(g.target)} {g.reached && '✓'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
          Document établi par Economiz à partir des données que vous avez importées ou déclarées. Il ne constitue pas un conseil en investissement.
        </footer>
      </article>
    </Container>
  )
}
