import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status-badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Inbox } from 'lucide-react'

describe('Button', () => {
  it('déclenche onClick au repos', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Valider</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('est désactivé et signalé occupé pendant le chargement', async () => {
    const onClick = vi.fn()
    render(<Button state="loading" loadingText="Envoi…" onClick={onClick}>Valider</Button>)
    const button = screen.getByRole('button', { name: 'Envoi…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('affiche les libellés de réussite et d’erreur', () => {
    const { rerender } = render(<Button state="success" successText="Enregistré">Valider</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Enregistré')
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'success')
    rerender(<Button state="error" errorText="Échec">Valider</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Échec')
  })
})

describe('StatusBadge', () => {
  it('affiche le libellé de chaque statut', () => {
    render(
      <>
        <StatusBadge status="favorable" />
        <StatusBadge status="vigilance" />
        <StatusBadge status="prioritaire" />
      </>,
    )
    expect(screen.getByText('Situation maîtrisée')).toBeInTheDocument()
    expect(screen.getByText('Point de vigilance')).toBeInTheDocument()
    expect(screen.getByText('Priorité d’action')).toBeInTheDocument()
  })
})

describe('Field', () => {
  it('relie le libellé et le message d’erreur au champ', () => {
    render(
      <Field label="Loyer" error="Montant invalide">
        {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
      </Field>,
    )
    const input = screen.getByLabelText('Loyer')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Montant invalide')
  })
})

describe('états d’écran', () => {
  it('rend chargement, vide, erreur et alerte', async () => {
    const onRetry = vi.fn()
    render(
      <>
        <LoadingState label="Analyse en cours" />
        <EmptyState icon={Inbox} title="Aucune opération" />
        <ErrorState onRetry={onRetry} />
        <Alert tone="success">Enregistré</Alert>
      </>,
    )
    expect(screen.getByText('Analyse en cours')).toBeInTheDocument()
    expect(screen.getByText('Aucune opération')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.getByText('Enregistré')).toBeInTheDocument()
  })
})
