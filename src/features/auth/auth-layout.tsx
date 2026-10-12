import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/brand/logo'
import { useDocumentTitle } from '@/lib/use-document-title'
import { useRouteFocus } from '@/lib/use-route-focus'

export function AuthLayout() {
  useRouteFocus()
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-4 py-5 sm:px-8">
        <Link to="/" aria-label="Economiz — accueil" className="inline-block">
          <Logo />
        </Link>
      </header>
      <main id="contenu" tabIndex={-1} className="outline-none flex flex-1 items-start justify-center px-4 pb-16 sm:items-center">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted-foreground">
        <Link to="/cgu" className="hover:text-foreground">CGU</Link>
        <Link to="/confidentialite" className="hover:text-foreground">Confidentialité</Link>
        <Link to="/securite" className="hover:text-foreground">Sécurité</Link>
        <Link to="/contact" className="hover:text-foreground">Aide</Link>
      </footer>
    </div>
  )
}

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useDocumentTitle(title)
  return (
    <>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="mt-2 text-[0.9375rem] text-muted-foreground">{description}</div>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
    </>
  )
}
