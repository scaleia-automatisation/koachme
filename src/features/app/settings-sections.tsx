// Sections complémentaires de « Profil et paramètres ».
import { useQueryClient } from '@tanstack/react-query'
import { Download, FileText, HelpCircle, LifeBuoy, Mail, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/feedback/states'
import { Badge } from '@/components/ui/badge'
import { Button, type ButtonState } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { FEATURES } from '@/config/features'
import { TERMS_VERSION } from '@/config/legal'
import { logSecurityEvent, useEntitlements } from '@/features/finance/billing'
import { exportAllData, useImports, useProfile, useUpdateProfile } from '@/features/finance/api'
import { formatPeriod } from './import-meta'

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function RegionalSection() {
  const profile = useProfile()
  return (
    <SettingsSection id="regional" title="Devise et paramètres régionaux">
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Devise</dt>
          <dd className="font-medium">Euro (€)</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Format des montants et des dates</dt>
          <dd className="font-medium">Français ({profile.data?.locale ?? 'fr-FR'})</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Economiz prend en charge les comptes en euros. Un relevé dans une autre devise est signalé à l’import.</p>
    </SettingsSection>
  )
}

export function NotificationsSection() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const p = profile.data
  if (!p) return null
  return (
    <SettingsSection id="notifications" title="Notifications" description="Un rappel facultatif pour mettre à jour votre bilan chaque mois.">
      <div className="space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={p.notify_monthly_reminder} disabled={update.isPending} onChange={(e) => update.mutate({ notify_monthly_reminder: e.target.checked })} />
          <span>
            <span className="font-medium">Rappel mensuel dans l’application</span>
            <span className="block text-xs text-muted-foreground">Un message sur votre bilan quand votre dernier relevé date de plus d’un mois.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={p.notify_email} disabled={update.isPending} onChange={(e) => update.mutate({ notify_email: e.target.checked })} />
          <span>
            <span className="flex items-center gap-2 font-medium">
              <Mail className="size-3.5" aria-hidden /> Rappel mensuel par email
            </span>
            <span className="block text-xs text-muted-foreground">
              {FEATURES.emailReminders ? 'Un email au début de chaque mois.' : 'Votre choix est enregistré ; les emails de rappel seront envoyés dès l’ouverture de ce service.'}
            </span>
          </span>
        </label>
        {update.isError && <p className="text-xs font-medium text-danger">L’enregistrement a échoué, réessayez.</p>}
      </div>
    </SettingsSection>
  )
}

export function AccountsDataSection() {
  const imports = useImports()
  const accounts = new Map<string, { count: number; start: string | null; end: string | null }>()
  for (const i of imports.data ?? []) {
    if (i.status !== 'needs_review' && i.status !== 'confirmed') continue
    const key = i.account_label ?? i.file_name
    const cur = accounts.get(key) ?? { count: 0, start: null, end: null }
    cur.count++
    if (i.period_start && (!cur.start || i.period_start < cur.start)) cur.start = i.period_start
    if (i.period_end && (!cur.end || i.period_end > cur.end)) cur.end = i.period_end
    accounts.set(key, cur)
  }
  return (
    <SettingsSection id="donnees" title="Comptes et données" description="Les comptes bancaires identifiés dans vos relevés. Seuls les 4 derniers chiffres du numéro de compte sont conservés.">
      {accounts.size ? (
        <ul className="divide-y divide-border text-sm">
          {[...accounts.entries()].map(([name, a]) => (
            <li key={name} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground">
                {a.count} relevé{a.count > 1 ? 's' : ''}
                {a.start && a.end ? ` · ${formatPeriod(a.start, a.end)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun compte importé.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/app/releves">Gérer mes relevés</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/budget?etape=revenus">Mes montants déclarés</Link>
        </Button>
      </div>
    </SettingsSection>
  )
}

export function PrivacySection() {
  const profile = useProfile()
  const p = profile.data
  return (
    <SettingsSection id="confidentialite" title="Confidentialité et consentements">
      <ul className="space-y-3 text-sm">
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            Conditions générales et politique de confidentialité acceptées
            {p?.terms_accepted_at && ` le ${new Date(p.terms_accepted_at).toLocaleDateString('fr-FR')}`} (version {p?.terms_version ?? TERMS_VERSION}).
          </span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>Lecture des relevés scannés (OCR) : votre accord est demandé à chaque document ; aucun accord général n’est enregistré.</span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>Aucun cookie publicitaire ni mesure d’audience. Vos données ne sont jamais revendues.</span>
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to="/confidentialite" className="font-medium text-primary hover:underline">
          Politique de confidentialité
        </Link>
        <Link to="/cgu" className="font-medium text-primary hover:underline">
          Conditions générales
        </Link>
        <Link to="/cookies" className="font-medium text-primary hover:underline">
          Cookies
        </Link>
      </div>
    </SettingsSection>
  )
}

export function SubscriptionSection() {
  const ent = useEntitlements()
  const free = ent.data?.plan === 'free'
  return (
    <SettingsSection id="abonnement" title="Abonnement et factures">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Offre actuelle : <span className="font-semibold">{ent.data?.plan_name ?? '…'}</span> {free && <Badge tone="success">Gratuite</Badge>}
        </p>
        <Link to="/tarifs" className="text-sm font-medium text-primary hover:underline">
          Comparer les offres
        </Link>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to="/app/abonnement">
          <FileText aria-hidden /> {free ? 'Découvrir Premium' : 'Gérer mon abonnement et mes factures'}
        </Link>
      </Button>
      <Link to="/abonnement-resiliation" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
        Abonnement, rétractation et résiliation
      </Link>
    </SettingsSection>
  )
}

export function ExportSection() {
  const qc = useQueryClient()
  const [state, setState] = useState<ButtonState>('idle')
  const download = async () => {
    setState('loading')
    try {
      const data = await exportAllData()
      void logSecurityEvent('data.export')
        .catch(() => {})
        .then(() => qc.invalidateQueries({ queryKey: ['my_audit_logs'] }))
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `economiz-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setState('success')
    } catch {
      setState('error')
    }
  }
  return (
    <SettingsSection id="export" title="Export des données" description="Téléchargez toutes vos données (profil, budget, relevés analysés, opérations, objectifs, conversations) au format JSON.">
      <Button variant="outline" onClick={download} state={state} loadingText="Préparation…" successText="Export téléchargé" errorText="Réessayer">
        <Download aria-hidden /> Exporter mes données
      </Button>
      {state === 'error' && <Alert tone="error" className="mt-3">L’export a échoué. Vérifiez votre connexion puis réessayez.</Alert>}
      <p className="mt-3 text-xs text-muted-foreground">Les fichiers PDF de vos relevés restent téléchargeables un par un depuis « Mes relevés ».</p>
    </SettingsSection>
  )
}

export function HelpSection() {
  return (
    <SettingsSection id="aide" title="Centre d’aide">
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { to: '/faq', icon: HelpCircle, label: 'Questions fréquentes' },
          { to: '/contact', icon: LifeBuoy, label: 'Contacter l’assistance' },
          { to: '/securite', icon: ShieldCheck, label: 'Sécurité de vos données' },
        ].map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium hover:border-primary/40">
            <l.icon className="size-4 text-primary" aria-hidden /> {l.label}
          </Link>
        ))}
      </div>
    </SettingsSection>
  )
}
