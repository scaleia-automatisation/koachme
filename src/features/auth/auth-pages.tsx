import { MailCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, LoadingState } from '@/components/feedback/states'
import { Button, type ButtonState } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Checkbox, PasswordInput } from '@/components/ui/form-controls'
import { TERMS_VERSION } from '@/config/legal'
import { needsMfa, useAuth } from '@/lib/use-auth'
import { authErrorMessage, EMAIL_RE, passwordProblem } from '@/lib/auth-errors'
import { safeNext } from '@/lib/safe-next'
import { supabase } from '@/lib/supabase'
import { AuthCard } from './auth-layout'

const origin = () => window.location.origin


// ---------------------------------------------------------------------------
// Inscription
// ---------------------------------------------------------------------------

export function SignUpPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', accepted: false })
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'accepted', string>>>({})
  const [state, setState] = useState<ButtonState>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Indiquez une adresse email valide'
    const pw = passwordProblem(form.password)
    if (pw) next.password = pw
    if (!form.accepted) next.accepted = 'Vous devez accepter les conditions pour créer un compte'
    setErrors(next)
    if (Object.keys(next).length) return

    setState('loading')
    setServerError(null)
    const email = form.email.trim().toLowerCase()
    const { error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: `${origin()}/auth/confirmation?type=signup`,
        data: { terms_version: TERMS_VERSION, display_name: form.name.trim() || undefined },
      },
    })
    if (error) {
      setState('error')
      setServerError(authErrorMessage(error))
      return
    }
    setState('success')
    navigate(`/verifier-email?email=${encodeURIComponent(email)}`)
  }

  return (
    <AuthCard
      title="Créer mon compte"
      description="Gratuit, sans carte bancaire. Votre premier bilan en quelques minutes."
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to="/connexion" className="font-medium text-primary underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Prénom (facultatif)">
          {({ id }) => <Input id={id} autoComplete="given-name" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        <Field label="Mot de passe" hint="8 caractères minimum, avec des lettres et au moins un chiffre." error={errors.password}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>

        <div>
          <label className="flex gap-3 text-sm">
            <Checkbox checked={form.accepted} onChange={(e) => setForm({ ...form, accepted: e.target.checked })} aria-invalid={errors.accepted ? true : undefined} />
            <span>
              J’accepte les{' '}
              <Link to="/cgu" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
                conditions générales d’utilisation
              </Link>{' '}
              et j’ai pris connaissance de la{' '}
              <Link to="/confidentialite" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
                politique de confidentialité
              </Link>
              .
            </span>
          </label>
          {errors.accepted && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {errors.accepted}
            </p>
          )}
        </div>

        <p className="rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          Vos données financières servent uniquement à calculer votre bilan. Elles ne sont jamais revendues. Nous ne vous demanderons jamais vos
          identifiants bancaires.
        </p>

        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Button type="submit" state={state} loadingText="Création du compte…" className="w-full">
          Créer mon compte
        </Button>
      </form>
    </AuthCard>
  )
}

// ---------------------------------------------------------------------------
// Vérification de l'email
// ---------------------------------------------------------------------------

function useResendConfirmation(email: string) {
  const [state, setState] = useState<ButtonState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const resend = async () => {
    if (!EMAIL_RE.test(email)) return
    setState('loading')
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${origin()}/auth/confirmation?type=signup` } })
    setState(error ? 'error' : 'success')
    setMessage(error ? authErrorMessage(error) : 'Un nouvel email vient d’être envoyé.')
  }
  return { state, message, resend }
}

export function CheckEmailPage() {
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''
  const { state, message, resend } = useResendConfirmation(email)

  return (
    <AuthCard title="Confirmez votre adresse email">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="size-7" aria-hidden />
        </div>
        <p className="mt-4 text-[0.9375rem]">
          Nous avons envoyé un lien de confirmation à <strong className="break-all">{email || 'votre adresse'}</strong>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Cliquez sur ce lien pour activer votre compte. Pensez à vérifier vos courriers indésirables.</p>
      </div>
      {message && (
        <Alert tone={state === 'error' ? 'error' : 'success'} className="mt-5">
          {message}
        </Alert>
      )}
      <div className="mt-6 flex flex-col gap-2">
        {email && (
          <Button variant="outline" state={state === 'success' ? 'idle' : state} loadingText="Envoi…" onClick={resend} disabled={state === 'success'}>
            Renvoyer l’email
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link to="/connexion">J’ai confirmé, me connecter</Link>
        </Button>
      </div>
    </AuthCard>
  )
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export function SignInPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('suite'))
  const { user, ready, currentLevel, nextLevel } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [state, setState] = useState<ButtonState>('idle')
  const [error, setError] = useState<{ message: string; unconfirmed: boolean } | null>(null)
  const resend = useResendConfirmation(form.email.trim().toLowerCase())

  if (ready && user && !needsMfa({ currentLevel, nextLevel }) && state === 'idle') return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(form.email.trim()) || !form.password) {
      setError({ message: 'Saisissez votre email et votre mot de passe.', unconfirmed: false })
      return
    }
    setState('loading')
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password })
    if (signInError) {
      setState('error')
      setError({ message: authErrorMessage(signInError), unconfirmed: signInError.code === 'email_not_confirmed' })
      return
    }
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setState('success')
    if (data && needsMfa({ currentLevel: data.currentLevel as 'aal1', nextLevel: data.nextLevel as 'aal2' })) {
      navigate(`/connexion/verification?suite=${encodeURIComponent(next)}`, { replace: true })
    } else {
      navigate(next, { replace: true })
    }
  }

  return (
    <AuthCard
      title="Se connecter"
      description="Heureux de vous revoir."
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-medium text-primary underline-offset-4 hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Email">
          {({ id }) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Mot de passe">
          {({ id }) => <PasswordInput id={id} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <div className="-mt-2 text-right">
          <Link to="/mot-de-passe-oublie" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
        {error && (
          <Alert tone="error">
            <p>{error.message}</p>
            {error.unconfirmed && (
              <button type="button" onClick={resend.resend} className="mt-1 font-medium text-primary underline-offset-4 hover:underline">
                {resend.state === 'success' ? 'Email renvoyé ✓' : 'Renvoyer l’email de confirmation'}
              </button>
            )}
          </Alert>
        )}
        <Button type="submit" state={state === 'success' ? 'loading' : state} loadingText="Connexion…" className="w-full">
          Se connecter
        </Button>
      </form>
    </AuthCard>
  )
}

// ---------------------------------------------------------------------------
// Second facteur (TOTP)
// ---------------------------------------------------------------------------

export function MfaChallengePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('suite') === '/reinitialiser-mot-de-passe' ? '/reinitialiser-mot-de-passe' : safeNext(params.get('suite'))
  const { ready, user, refreshAal, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [state, setState] = useState<ButtonState>('idle')
  const [error, setError] = useState<string | null>(null)

  if (ready && !user) return <Navigate to="/connexion" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError('Le code contient 6 chiffres.')
      return
    }
    setState('loading')
    setError(null)
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    const factor = factors?.totp.find((f) => f.status === 'verified')
    if (listError || !factor) {
      setState('error')
      setError('Aucune méthode de vérification trouvée. Contactez l’assistance.')
      return
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    if (verifyError) {
      setState('error')
      setError(authErrorMessage(verifyError))
      return
    }
    await refreshAal()
    setState('success')
    navigate(next, { replace: true })
  }

  return (
    <AuthCard
      title="Vérification en deux étapes"
      description="Saisissez le code à 6 chiffres affiché dans votre application d’authentification."
      footer={
        <button type="button" onClick={() => void signOut().then(() => navigate('/connexion'))} className="font-medium text-primary underline-offset-4 hover:underline">
          Utiliser un autre compte
        </button>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="flex justify-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
        </div>
        <Field label="Code de vérification" error={error}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              className="text-center text-xl tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button type="submit" state={state} loadingText="Vérification…" className="w-full">
          Valider
        </Button>
      </form>
    </AuthCard>
  )
}

// ---------------------------------------------------------------------------
// Mot de passe oublié / réinitialisation
// ---------------------------------------------------------------------------

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<ButtonState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Indiquez une adresse email valide')
      return
    }
    setState('loading')
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin()}/auth/confirmation?type=recovery`,
    })
    if (resetError && resetError.code?.startsWith('over_')) {
      setState('error')
      setError(authErrorMessage(resetError))
      return
    }
    // Même message que le compte existe ou non (pas d'énumération des comptes).
    setState('success')
    setSent(true)
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      description={sent ? undefined : 'Indiquez votre email : nous vous enverrons un lien pour choisir un nouveau mot de passe.'}
      footer={
        <Link to="/connexion" className="font-medium text-primary underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">
          Si un compte existe pour <strong className="break-all">{email.trim()}</strong>, vous allez recevoir un email avec un lien valable 1 heure.
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <Field label="Email" error={error}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
            )}
          </Field>
          <Button type="submit" state={state} loadingText="Envoi…" className="w-full">
            Recevoir le lien
          </Button>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { ready, user, currentLevel, nextLevel } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; server?: string }>({})
  const [state, setState] = useState<ButtonState>('idle')

  if (!ready) return <LoadingState />
  if (!user) {
    return (
      <AuthCard title="Lien expiré" description="Ce lien de réinitialisation n’est plus valide.">
        <Button asChild className="w-full">
          <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>
        </Button>
      </AuthCard>
    )
  }
  if (needsMfa({ currentLevel, nextLevel })) return <Navigate to="/connexion/verification?suite=/reinitialiser-mot-de-passe" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    const pw = passwordProblem(password)
    if (pw) next.password = pw
    if (password !== confirm) next.confirm = 'Les deux mots de passe ne correspondent pas'
    setErrors(next)
    if (Object.keys(next).length) return
    setState('loading')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setState('error')
      setErrors({ server: authErrorMessage(error) })
      return
    }
    setState('success')
    setTimeout(() => navigate('/app', { replace: true }), 900)
  }

  return (
    <AuthCard title="Nouveau mot de passe" description="Choisissez un mot de passe que vous n’utilisez pas ailleurs.">
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec des lettres et au moins un chiffre." error={errors.password}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        <Field label="Confirmer le mot de passe" error={errors.confirm}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        {errors.server && <Alert tone="error">{errors.server}</Alert>}
        <Button type="submit" state={state} loadingText="Enregistrement…" successText="Mot de passe modifié" className="w-full">
          Enregistrer
        </Button>
      </form>
    </AuthCard>
  )
}

// ---------------------------------------------------------------------------
// Retour depuis un lien email
// ---------------------------------------------------------------------------

type ConfirmType = 'signup' | 'recovery' | 'email_change' | 'email'

/**
 * Point d'arrivée des liens envoyés par email. Gère les deux formats :
 * - lien Supabase par défaut : la session arrive dans l'URL et est détectée automatiquement ;
 * - lien personnalisé ?token_hash=…&type=… (modèles d'email Economiz).
 */
export function AuthConfirmPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { ready, user } = useAuth()
  const [error, setError] = useState<string | null>(() => {
    const hash = new URLSearchParams(location.hash.slice(1))
    const code = hash.get('error_code') ?? params.get('error_code')
    if (!code) return null
    return code === 'otp_expired' ? 'Ce lien a expiré ou a déjà été utilisé.' : 'Ce lien n’est pas valide.'
  })
  const type = (params.get('type') ?? 'signup') as ConfirmType
  const tokenHash = params.get('token_hash')
  const [verifying, setVerifying] = useState(Boolean(tokenHash))

  useEffect(() => {
    if (!tokenHash || error) return
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: type === 'signup' ? 'email' : type }).then(({ error: e }) => {
      if (e) setError(authErrorMessage(e))
      setVerifying(false)
    })
  }, [tokenHash, type, error])

  useEffect(() => {
    if (!ready || verifying || error || !user) return
    navigate(type === 'recovery' ? '/reinitialiser-mot-de-passe' : '/app', { replace: true })
  }, [ready, verifying, error, user, type, navigate])

  if (error) {
    return (
      <AuthCard title="Lien invalide" description={error}>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link to={type === 'recovery' ? '/mot-de-passe-oublie' : '/connexion'}>{type === 'recovery' ? 'Demander un nouveau lien' : 'Se connecter'}</Link>
          </Button>
        </div>
      </AuthCard>
    )
  }
  if (ready && !verifying && !user) {
    return (
      <AuthCard title="Adresse confirmée" description="Vous pouvez maintenant vous connecter.">
        <Button asChild className="w-full">
          <Link to="/connexion">Se connecter</Link>
        </Button>
      </AuthCard>
    )
  }
  return <LoadingState label="Vérification du lien…" />
}
