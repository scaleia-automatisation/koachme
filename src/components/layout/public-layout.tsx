import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE, Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import { Container } from './container'
import { useRouteFocus } from '@/lib/use-route-focus'

const CURRENT_YEAR = new Date().getFullYear()

const MAIN_NAV = [
  { to: '/fonctionnalites', label: 'Fonctionnalités' },
  { to: '/tarifs', label: 'Tarifs' },
  { to: '/securite', label: 'Sécurité' },
  { to: '/faq', label: 'FAQ' },
] as const

const FOOTER_COLUMNS = [
  {
    title: 'Produit',
    links: [
      { to: '/fonctionnalites', label: 'Fonctionnalités' },
      { to: '/tarifs', label: 'Tarifs' },
      { to: '/securite', label: 'Sécurité et confidentialité' },
      { to: '/faq', label: 'Questions fréquentes' },
    ],
  },
  {
    title: 'Assistance',
    links: [
      { to: '/contact', label: 'Contact et assistance' },
      { to: '/abonnement-resiliation', label: 'Abonnement et résiliation' },
      { to: '/connexion', label: 'Se connecter' },
      { to: '/inscription', label: 'Créer un compte' },
    ],
  },
  {
    title: 'Informations légales',
    links: [
      { to: '/cgu', label: 'Conditions générales' },
      { to: '/confidentialite', label: 'Politique de confidentialité' },
      { to: '/cookies', label: 'Cookies' },
      { to: '/mentions-legales', label: 'Mentions légales' },
    ],
  },
] as const

function AuthActions({ onNavigate, stacked = false }: { onNavigate?: () => void; stacked?: boolean }) {
  const { user } = useAuth()
  if (user) {
    return (
      <Button asChild size={stacked ? 'md' : 'sm'} className={cn(stacked && 'w-full')}>
        <Link to="/app" onClick={onNavigate}>
          Mon espace
        </Link>
      </Button>
    )
  }
  return (
    <div className={cn('flex gap-2', stacked && 'flex-col')}>
      <Button asChild variant="ghost" size={stacked ? 'md' : 'sm'} className={cn(stacked && 'w-full')}>
        <Link to="/connexion" onClick={onNavigate}>
          Se connecter
        </Link>
      </Button>
      <Button asChild size={stacked ? 'md' : 'sm'} className={cn(stacked && 'w-full')}>
        <Link to="/inscription" onClick={onNavigate}>
          Commencer gratuitement
        </Link>
      </Button>
    </div>
  )
}

export function PublicLayout() {
  useRouteFocus()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Ferme le menu à chaque changement de page.
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  // Remonte en haut de page à chaque navigation (sauf ancre).
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label={`${APP_NAME} — accueil`}>
            <Logo />
          </Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
            {MAIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted hover:text-foreground', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden lg:block">
            <AuthActions />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </Container>
        {menuOpen && (
          <div id="menu-mobile" className="border-t border-border bg-surface lg:hidden">
            <Container className="flex flex-col gap-1 py-4">
              {MAIN_NAV.map((item) => (
                <NavLink key={item.to} to={item.to} className="rounded-md px-3 py-3 text-[0.9375rem] font-medium hover:bg-muted">
                  {item.label}
                </NavLink>
              ))}
              <NavLink to="/contact" className="rounded-md px-3 py-3 text-[0.9375rem] font-medium hover:bg-muted">
                Contact
              </NavLink>
              <div className="mt-3 border-t border-border pt-4">
                <AuthActions stacked onNavigate={() => setMenuOpen(false)} />
              </div>
            </Container>
          </div>
        )}
      </header>

      <main id="contenu" tabIndex={-1} className="outline-none flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-surface">
        <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">
              {APP_TAGLINE} Le coach budgétaire personnel qui vous aide à comprendre votre budget et à épargner.
            </p>
            <p className="text-xs text-muted-foreground">Nous ne vous demanderons jamais vos identifiants bancaires.</p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </Container>
        <div className="border-t border-border">
          <Container className="py-5 text-xs text-muted-foreground">
            © {CURRENT_YEAR} {APP_NAME}. Economiz est un outil d’aide à la gestion budgétaire et ne fournit pas de conseil en investissement.
          </Container>
        </div>
      </footer>
    </div>
  )
}
