// Espace d'administration, séparé de l'espace utilisateur. L'accès à l'écran
// dépend des rôles lus côté serveur (my_roles) ; chaque donnée affichée est
// de toute façon filtrée par la base selon le rôle réel de la session.
import { Activity, ArrowLeft, BarChart3, BookOpen, Cpu, CreditCard, LifeBuoy, ShieldAlert, Users, type LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Logo } from '@/components/brand/logo'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { useMyRoles } from '@/features/finance/billing'
import { useAuth } from '@/lib/use-auth'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { useRouteFocus } from '@/lib/use-route-focus'

const NAV: { to: string; label: string; icon: LucideIcon; admin?: boolean; end?: boolean }[] = [
  { to: '/admin', label: 'Vue d’ensemble', icon: BarChart3, end: true },
  { to: '/admin/assistance', label: 'Assistance', icon: LifeBuoy },
  { to: '/admin/technique', label: 'Erreurs et imports', icon: Activity },
  { to: '/admin/ia', label: 'Usage de l’IA', icon: Cpu },
  { to: '/admin/offres', label: 'Offres et limites', icon: CreditCard, admin: true },
  { to: '/admin/faq', label: 'FAQ', icon: BookOpen, admin: true },
  { to: '/admin/securite', label: 'Sécurité', icon: ShieldAlert, admin: true },
  { to: '/admin/equipe', label: 'Équipe', icon: Users, admin: true },
]

export function AdminLayout() {
  useRouteFocus()
  useDocumentTitle('Administration')
  const roles = useMyRoles()
  const { nextLevel, user } = useAuth()

  if (roles.isLoading) return <LoadingState className="min-h-dvh" />
  if (roles.error) return <ErrorState onRetry={() => void roles.refetch()} className="min-h-dvh" />
  const isAdmin = roles.data?.includes('admin') ?? false
  if (!roles.data?.length) {
    return (
      <Container className="max-w-lg py-24 text-center">
        <h1 className="text-xl font-semibold">Accès réservé</h1>
        <p className="mt-2 text-muted-foreground">Cet espace est réservé à l’équipe Economiz.</p>
        <Link to="/app" className="mt-6 inline-block font-medium text-primary hover:underline">
          Retour à mon espace
        </Link>
      </Container>
    )
  }

  const nav = NAV.filter((n) => !n.admin || isAdmin)
  return (
    <div className="min-h-dvh bg-muted/40">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <Container className="flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" aria-label="Administration Economiz">
              <Logo />
            </Link>
            <Badge tone="warning">Administration</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {user?.email} · {isAdmin ? 'administrateur' : 'assistance'}
            </span>
            <Link to="/app" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <ArrowLeft className="size-4" aria-hidden /> Espace utilisateur
            </Link>
          </div>
        </Container>
      </header>
      <Container className="grid gap-6 py-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Administration" className="-mx-1 flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:self-start">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn('flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface', isActive ? 'bg-surface font-medium text-foreground shadow-card' : 'text-muted-foreground')
              }
            >
              <n.icon className="size-4" aria-hidden /> {n.label}
            </NavLink>
          ))}
        </nav>
        <main id="contenu" tabIndex={-1} className="outline-none min-w-0 space-y-6">
          {nextLevel !== 'aal2' && (
            <Alert tone="error">
              Votre compte d’équipe n’est pas protégé par la double authentification. Activez-la dans{' '}
              <Link to="/app/parametres#securite" className="font-medium underline">
                Profil et paramètres
              </Link>{' '}
              avant toute opération d’administration.
            </Alert>
          )}
          <Outlet context={{ isAdmin }} />
        </main>
      </Container>
    </div>
  )
}
