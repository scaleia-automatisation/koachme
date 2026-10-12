import { Compass } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { ErrorState, EmptyState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/error-reporting'

export function NotFoundPage() {
  return (
    <Container className="py-20">
      <EmptyState
        icon={Compass}
        heading="h1"
        title="Page introuvable"
        description="La page que vous cherchez n’existe pas ou a été déplacée."
        action={
          <Button asChild>
            <Link to="/">Retour à l’accueil</Link>
          </Button>
        }
      />
    </Container>
  )
}

/** Affiché si une erreur inattendue survient pendant le rendu d'une route. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  if (import.meta.env.DEV) console.error(error)
  reportError('route_error', error)
  return (
    <Container className="py-20">
      <ErrorState
        heading="h1"
        title="Cette page n’a pas pu s’afficher"
        description="Une erreur inattendue est survenue. Rechargez la page ; si le problème persiste, réessayez plus tard."
        onRetry={() => window.location.reload()}
      />
    </Container>
  )
}
