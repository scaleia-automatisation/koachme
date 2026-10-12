// Indicateurs agrégés : inscriptions, abonnements, imports, IA, assistance.
// Aucune donnée individuelle ni bancaire n'est affichée ici.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, LoadingState } from '@/components/feedback/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatEuros } from '@/domain'
import { useAdminOverview, useAiUsage, useSignupsSeries } from './admin-api'

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const nf = new Intl.NumberFormat('fr-FR')

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{typeof value === 'number' ? nf.format(value) : value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function DailyBars({ data, dataKey, name, label }: { data: Record<string, unknown>[]; dataKey: string; name: string; label: string }) {
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="jour" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey={dataKey} name={name} fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const IMPORT_STATUS: Record<string, string> = { uploaded: 'déposés', processing: 'en cours', needs_review: 'à vérifier', confirmed: 'confirmés', failed: 'échoués' }

export function AdminOverviewPage() {
  const overview = useAdminOverview()
  const signups = useSignupsSeries(30)

  if (overview.isLoading) return <LoadingState className="py-16" />
  if (overview.error || !overview.data) return <ErrorState onRetry={() => void overview.refetch()} />
  const o = overview.data
  const imports = o.imports_30d ?? {}
  const importsTotal = Object.values(imports).reduce((s, n) => s + n, 0)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Vue d’ensemble</h1>
      <section aria-label="Utilisateurs et abonnements" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Comptes" value={o.users_total} hint={`${o.active_30d} actifs sur 30 jours`} />
        <Kpi label="Inscriptions" value={o.signups_7d} hint={`7 jours · ${o.signups_30d} sur 30 jours`} />
        <Kpi label="Abonnements actifs" value={o.subscriptions_active} hint={o.subscriptions_past_due ? `${o.subscriptions_past_due} en défaut de paiement` : 'aucun impayé'} />
        <Kpi label="Revenu mensuel récurrent" value={formatEuros(o.mrr_cents)} hint="annuels ramenés au mois" />
        <Kpi label="Relevés (30 j)" value={importsTotal} hint={imports.failed ? `${imports.failed} en échec` : 'aucun échec'} />
        <Kpi label="Questions au coach (30 j)" value={o.coach_requests_30d} hint={`${nf.format(o.coach_tokens_30d)} jetons`} />
        <Kpi label="Demandes d’assistance ouvertes" value={o.support_open} />
        <Kpi label="Erreurs techniques (24 h)" value={o.errors_24h} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Inscriptions sur 30 jours</CardTitle>
        </CardHeader>
        <CardContent>
          {signups.data ? (
            <DailyBars
              data={signups.data.map((d) => ({ jour: shortDay(d.day), inscriptions: Number(d.signups) }))}
              dataKey="inscriptions"
              name="Inscriptions"
              label={`Inscriptions par jour sur 30 jours, total ${signups.data.reduce((s, d) => s + Number(d.signups), 0)}`}
            />
          ) : (
            <LoadingState />
          )}
        </CardContent>
      </Card>

      {importsTotal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Relevés sur 30 jours</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {Object.entries(imports).map(([status, n]) => (
              <span key={status}>
                <span className="tabular font-semibold">{n}</span> {IMPORT_STATUS[status] ?? status}
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}

export function AdminAiPage() {
  const usage = useAiUsage(30)
  if (usage.isLoading) return <LoadingState className="py-16" />
  if (usage.error || !usage.data) return <ErrorState onRetry={() => void usage.refetch()} />
  const rows = usage.data
  const total = rows.reduce((s, r) => ({ requests: s.requests + Number(r.requests), tokens: s.tokens + Number(r.tokens), fallbacks: s.fallbacks + Number(r.fallbacks) }), { requests: 0, tokens: 0, fallbacks: 0 })
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Usage de l’IA</h1>
      <p className="text-sm text-muted-foreground">Coach IA, 30 derniers jours. Les réponses de repli (quota atteint, offre gratuite, service indisponible) ne consomment pas de jetons.</p>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Questions" value={total.requests} />
        <Kpi label="Jetons consommés" value={total.tokens} />
        <Kpi label="Réponses de repli" value={total.fallbacks} />
        <Kpi label="Utilisateurs max / jour" value={Math.max(0, ...rows.map((r) => Number(r.users)))} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Questions par jour</CardTitle>
          <CardDescription>Le modèle et les quotas par offre se règlent dans « Offres et limites » et dans la configuration serveur.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <DailyBars data={rows.map((r) => ({ jour: shortDay(r.day), questions: Number(r.requests) }))} dataKey="questions" name="Questions" label={`Questions au coach par jour, total ${total.requests}`} />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune question posée sur la période.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
