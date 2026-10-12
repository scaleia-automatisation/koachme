import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Providers } from './providers'

// Client Supabase simulé : visiteur non connecté.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: null }) },
    },
  },
}))

beforeAll(() => {
  // jsdom ne fournit pas IntersectionObserver (utilisé par les animations au défilement).
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
  window.scrollTo = () => undefined
})

async function renderAt(path: string) {
  const { routes } = await import('./router')
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
  return router
}

describe('pages publiques', () => {
  it('affiche la page d’accueil avec le bilan d’exemple calculé et un appel à l’inscription', async () => {
    await renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Votre argent, en clair.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Exemple illustratif de bilan')).toBeInTheDocument()
    expect(screen.getByText('Point de vigilance')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Faire mon bilan gratuit/ })[0]).toHaveAttribute('href', '/inscription')
  })

  it.each([
    ['/fonctionnalites', /Tout ce qu’il faut/],
    ['/tarifs', /Commencez gratuitement/],
    ['/securite', /Vos finances sont personnelles/],
    ['/faq', 'Questions fréquentes'],
    ['/contact', /Une question/],
    ['/cgu', 'Conditions générales d’utilisation'],
    ['/confidentialite', 'Politique de confidentialité'],
    ['/cookies', 'Cookies et traceurs'],
    ['/mentions-legales', 'Mentions légales'],
    ['/abonnement-resiliation', 'Abonnement et résiliation'],
    ['/connexion', 'Se connecter'],
    ['/inscription', 'Créer mon compte'],
    ['/mot-de-passe-oublie', 'Mot de passe oublié'],
  ])('%s affiche son titre', async (path, title) => {
    await renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it('le footer relie toutes les pages légales', async () => {
    await renderAt('/faq')
    for (const href of ['/cgu', '/confidentialite', '/cookies', '/mentions-legales', '/abonnement-resiliation', '/contact', '/tarifs', '/securite']) {
      expect(document.querySelector(`footer a[href="${href}"]`)).not.toBeNull()
    }
  })

  it('affiche une page 404 pour une adresse inconnue', async () => {
    await renderAt('/adresse-inexistante')
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument()
  })
})

describe('espace personnel', () => {
  it('redirige un visiteur non connecté vers la connexion', async () => {
    const router = await renderAt('/app/budget')
    expect(await screen.findByRole('heading', { level: 1, name: 'Se connecter' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/connexion')
    expect(router.state.location.search).toBe('?suite=%2Fapp%2Fbudget')
  })
})
