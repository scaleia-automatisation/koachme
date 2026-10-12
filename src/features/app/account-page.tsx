import { LogOut, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button, type ButtonState } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/form-controls'
import { useProfile, useUpdateProfile } from '@/features/finance/api'
import { useAuth } from '@/lib/use-auth'
import { authErrorMessage, passwordProblem } from '@/lib/auth-errors'
import { supabase } from '@/lib/supabase'
import { useDocumentTitle } from '@/lib/use-document-title'
import { logSecurityEvent } from '@/features/finance/billing'
import { AccountsDataSection, ExportSection, HelpSection, NotificationsSection, PrivacySection, RegionalSection, SubscriptionSection } from './settings-sections'
import { RetentionSection, SecurityActivitySection, SupportAccessSection } from './security-sections'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ProfileSection() {
  const { user } = useAuth()
  const profile = useProfile()
  const update = useUpdateProfile()
  const [name, setName] = useState<string | null>(null)
  const value = name ?? profile.data?.display_name ?? ''
  const state: ButtonState = update.isPending ? 'loading' : update.isError ? 'error' : update.isSuccess && name === null ? 'success' : 'idle'

  return (
    <Section title="Profil">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ display_name: value.trim() || null }, { onSuccess: () => setName(null) })
        }}
      >
        <Field label="Prénom">
          {({ id }) => <Input id={id} maxLength={60} value={value} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />}
        </Field>
        <p className="text-sm">
          <span className="text-muted-foreground">Email : </span>
          <span className="font-medium break-all">{user?.email}</span>
        </p>
        <Button type="submit" variant="outline" state={state} successText="Enregistré" disabled={name === null}>
          Enregistrer
        </Button>
      </form>
    </Section>
  )
}

function PasswordSection() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<ButtonState>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    setState('loading')
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setState('error')
      setError(authErrorMessage(updateError))
      return
    }
    void logSecurityEvent('auth.password_changed').catch(() => {})
    setState('success')
    setPassword('')
  }

  return (
    <Section title="Mot de passe">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec des lettres et au moins un chiffre." error={error}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setState('idle') }} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        <Button type="submit" variant="outline" state={state} successText="Mot de passe modifié" loadingText="Enregistrement…">
          Modifier le mot de passe
        </Button>
      </form>
    </Section>
  )
}

interface Enrollment {
  factorId: string
  qr: string
  secret: string
}

function MfaSection() {
  const { refreshAal } = useAuth()
  const factors = useQuery({
    queryKey: ['mfa_factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data
    },
  })
  const factorId = factors.data?.totp.find((f) => f.status === 'verified')?.id ?? null
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<ButtonState>('idle')
  const [confirmDisable, setConfirmDisable] = useState(false)

  const load = () => factors.refetch()

  const start = async () => {
    setError(null)
    setState('loading')
    // Nettoie une éventuelle activation inachevée.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const f of existing?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Application ${new Date().toISOString().slice(0, 10)}` })
    setState('idle')
    if (enrollError || !data) {
      setError(authErrorMessage(enrollError))
      return
    }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setError('Le code contient 6 chiffres.')
      return
    }
    setState('loading')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code })
    if (verifyError) {
      setState('error')
      setError(authErrorMessage(verifyError))
      return
    }
    await refreshAal()
    void logSecurityEvent('auth.mfa_enabled').catch(() => {})
    setState('success')
    setEnrollment(null)
    setCode('')
    await load()
  }

  const disable = async () => {
    if (!factorId) return
    setState('loading')
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
    if (unenrollError) {
      setState('error')
      setError(authErrorMessage(unenrollError))
      return
    }
    await supabase.auth.refreshSession()
    await refreshAal()
    void logSecurityEvent('auth.mfa_disabled').catch(() => {})
    setState('idle')
    setConfirmDisable(false)
    await load()
  }

  return (
    <Section title="Authentification à deux facteurs" description="Protégez votre compte avec un code à usage unique généré par une application (Google Authenticator, Microsoft Authenticator, 1Password…).">
      {factors.isLoading ? (
        <LoadingState className="py-4" />
      ) : factorId ? (
        <div className="space-y-4">
          <Badge tone="success">
            <ShieldCheck className="size-3.5" aria-hidden /> Activée
          </Badge>
          {confirmDisable ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="sm" state={state} onClick={disable}>
                Confirmer la désactivation
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDisable(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmDisable(true)}>
              <ShieldOff aria-hidden /> Désactiver
            </Button>
          )}
        </div>
      ) : enrollment ? (
        <form onSubmit={verify} className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Scannez ce QR code avec votre application d’authentification.</li>
            <li>Saisissez le code à 6 chiffres qu’elle affiche.</li>
          </ol>
          <img src={enrollment.qr} alt="QR code d’activation de l’authentification à deux facteurs" className="size-44 rounded-lg border border-border bg-white p-2" />
          <p className="text-xs text-muted-foreground">
            Impossible de scanner ? Saisissez cette clé : <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono">{enrollment.secret}</code>
          </p>
          <Field label="Code de vérification" error={error}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="max-w-40 text-center tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" state={state} loadingText="Vérification…">
              Activer
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setEnrollment(null); setError(null) }}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <Badge>Désactivée</Badge>
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <Button variant="outline" state={state} onClick={start}>
              <ShieldCheck aria-hidden /> Activer la double authentification
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}

function SessionsSection() {
  const { signOut } = useAuth()
  const [state, setState] = useState<ButtonState>('idle')
  return (
    <Section title="Sessions" description="Vous avez perdu un appareil ou utilisé un ordinateur partagé ? Déconnectez toutes les sessions ouvertes.">
      <Button
        variant="outline"
        state={state}
        onClick={async () => {
          setState('loading')
          await logSecurityEvent('auth.sessions_revoked').catch(() => {})
          await signOut('global')
        }}
      >
        <LogOut aria-hidden /> Se déconnecter de tous les appareils
      </Button>
    </Section>
  )
}

function DeleteSection() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState<ButtonState>('idle')
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setState('loading')
    setError(null)
    const { error: fnError } = await supabase.functions.invoke('delete-account', { body: { confirmation } })
    if (fnError) {
      setState('error')
      setError('La suppression a échoué. Réessayez ou contactez l’assistance.')
      return
    }
    // Quitte l'espace protégé avant de fermer la session, pour afficher la confirmation.
    navigate('/?compte=supprime', { replace: true })
    await signOut()
  }

  return (
    <Card className="border-danger/30">
      <CardHeader>
        <CardTitle className="text-danger">Supprimer mon compte</CardTitle>
        <CardDescription>Vos relevés, vos opérations, votre budget et toutes vos données seront définitivement effacés. Cette action est irréversible.</CardDescription>
      </CardHeader>
      <CardContent>
        {open ? (
          <div className="space-y-4">
            <Field label="Pour confirmer, saisissez SUPPRIMER">
              {({ id }) => <Input id={id} autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />}
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={confirmation !== 'SUPPRIMER'} state={state} loadingText="Suppression…" onClick={remove}>
                <Trash2 aria-hidden /> Supprimer définitivement
              </Button>
              <Button variant="ghost" onClick={() => { setOpen(false); setConfirmation('') }}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger-soft" onClick={() => setOpen(true)}>
            <Trash2 aria-hidden /> Supprimer mon compte
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

const SETTINGS_NAV = [
  ['profil', 'Informations personnelles'],
  ['regional', 'Devise et région'],
  ['notifications', 'Notifications'],
  ['donnees', 'Comptes et données'],
  ['confidentialite', 'Confidentialité'],
  ['securite', 'Sécurité et sessions'],
  ['activite', 'Activité de sécurité'],
  ['assistance', 'Accès de l’assistance'],
  ['conservation', 'Conservation des données'],
  ['abonnement', 'Abonnement et factures'],
  ['export', 'Export des données'],
  ['suppression', 'Suppression du compte'],
  ['aide', 'Centre d’aide'],
] as const

export function AccountPage() {
  useDocumentTitle('Profil et paramètres')
  return (
    <Container className="grid gap-8 py-8 sm:py-12 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Rubriques des paramètres" className="hidden lg:block">
        <ul className="sticky top-24 space-y-1 text-sm">
          {SETTINGS_NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profil et paramètres</h1>
        <div id="profil" className="scroll-mt-20">
          <ProfileSection />
        </div>
        <RegionalSection />
        <NotificationsSection />
        <AccountsDataSection />
        <PrivacySection />
        <div id="securite" className="scroll-mt-20 space-y-6">
          <PasswordSection />
          <MfaSection />
          <SessionsSection />
        </div>
        <SecurityActivitySection />
        <SupportAccessSection />
        <RetentionSection />
        <SubscriptionSection />
        <ExportSection />
        <div id="suppression" className="scroll-mt-20">
          <DeleteSection />
        </div>
        <HelpSection />
      </div>
    </Container>
  )
}
