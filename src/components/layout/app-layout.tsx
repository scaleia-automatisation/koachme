import { FileText, LayoutDashboard, LogOut, MessageCircle, PieChart, ShieldCheck, Target, TrendingUp, UserRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/brand/logo'
import { ErrorState, LoadingState } from '@/components/feedback/states'
import { Button, type ButtonState } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form-controls'
import { TERMS_VERSION } from '@/config/legal'
import { useProfile, useUpdateProfile } from '@/features/finance/api'
import { useMyRoles } from '@/features/finance/billing'
import { ReferenceGate } from '@/features/finance/reference'
import { needsMfa, useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import { Container } from './container'
import { NotificationsMenu } from './notifications-menu'
import { useRouteFocus } from '@/lib/use-route-focus'

/** Navigation principale : six entrées maximum. Profil et paramètres sont accessibles depuis l’en-tête. */
const APP_NAV: { to: string; label: string; short: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/app', label: 'Mon bilan', short: 'Bilan', icon: LayoutDashboard, end: true },
  { to: '/app/releves', label: 'Mes relevés', short: 'Relevés', icon: FileText },
  { to: '/app/depenses', label: 'Mes dépenses', short: 'Dépenses', icon: PieChart },
  { to: '/app/coach', label: 'Coach IA', short: 'Coach', icon: MessageCircle },
  { to: '/app/objectifs', label: 'Objectifs', short: 'Objectifs', icon: Target },
  { to: '/app/progression', label: 'Progression', short: 'Progrès', icon: TrendingUp },
]

/** Protège l'espace : session obligatoire et second facteur validé s'il est activé. */
export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()
  if (!auth.ready) return <LoadingState className="min-h-dvh" />
  const next = encodeURIComponent(location.pathname + location.search)
  if (!auth.user) return <Navigate to={`/connexion?suite=${next}`} replace />
  if (needsMfa(auth)) return <Navigate to={`/connexion/verification?suite=${next}`} replace />
  return (
    <ReferenceGate>
      <Outlet />
    </ReferenceGate>
  )
}

function TermsGate() {
  const update = useUpdateProfile()
  const [accepted, setAccepted] = useState(false)
  const state: ButtonState = update.isPending ? 'loading' : update.isError ? 'error' : 'idle'
  return (
    <Container className="max-w-lg py-16">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-xl font-semibold">Nos conditions ont évolué</h1>
        <p className="mt-2 text-[0.9375rem] text-muted-foreground">Pour continuer à utiliser Economiz, merci de prendre connaissance des conditions en vigueur.</p>
        <label className="mt-6 flex gap-3 text-sm">
          <Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
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
        <Button
          className="mt-6 w-full"
          disabled={!accepted}
          state={state}
          errorText="Réessayer"
          onClick={() => update.mutate({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() })}
        >
          Continuer
        </Button>
      </div>
    </Container>
  )
}

export function AppLayout() {
  useRouteFocus()
  const { signOut, user } = useAuth()
  const profile = useProfile()
  const roles = useMyRoles()

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md print:hidden">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link to="/app" aria-label="Economiz — mon bilan">
            <Logo />
          </Link>
          <nav aria-label="Espace personnel" className="hidden items-center gap-0.5 md:flex">
            {APP_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn('flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted', isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')
                }
              >
                <item.icon className="size-4" aria-hidden />
                <span className="lg:hidden">{item.short}</span>
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {!!roles.data?.length && (
              <Button asChild variant="ghost" size="icon" aria-label="Administration" title="Administration">
                <Link to="/admin">
                  <ShieldCheck aria-hidden />
                </Link>
              </Button>
            )}
            <NotificationsMenu />
            <Button asChild variant="ghost" size="sm" aria-label="Profil et paramètres">
              <NavLink to="/app/parametres">
                <UserRound aria-hidden />
                <span className="hidden max-w-36 truncate xl:inline">{profile.data?.display_name ?? user?.email}</span>
              </NavLink>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut aria-hidden />
            </Button>
          </div>
        </Container>
      </header>

      <main id="contenu" tabIndex={-1} className="outline-none flex-1">
        {profile.isLoading ? (
          <LoadingState className="py-24" />
        ) : profile.error ? (
          <ErrorState onRetry={() => void profile.refetch()} className="py-24" />
        ) : profile.data?.terms_version !== TERMS_VERSION ? (
          <TermsGate />
        ) : (
          <Outlet />
        )}
      </main>

      <nav aria-label="Espace personnel" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 print:hidden border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {APP_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[0.625rem] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}
          >
            <item.icon className="size-5" aria-hidden />
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
