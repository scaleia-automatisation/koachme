// Référence visuelle des composants, disponible uniquement en développement
// (la route n'est pas déclarée dans le build de production).
import { Inbox } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status-badge'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button, type ButtonState } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { parseEuros } from '@/domain'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function AsyncButtonDemo({ outcome }: { outcome: 'success' | 'error' }) {
  const [state, setState] = useState<ButtonState>('idle')
  const run = () => {
    setState('loading')
    setTimeout(() => {
      setState(outcome)
      setTimeout(() => setState('idle'), 1500)
    }, 900)
  }
  return (
    <Button state={state} onClick={run} loadingText="Enregistrement…" successText="Enregistré" errorText="Échec">
      {outcome === 'success' ? 'Action réussie' : 'Action en échec'}
    </Button>
  )
}

export function DesignSystemPage() {
  const [amount, setAmount] = useState('')
  const amountError = amount && parseEuros(amount) === null ? 'Saisissez un montant valide, par exemple 1 250,50' : null

  return (
    <Container className="space-y-12 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
        <p className="mt-2 text-muted-foreground">Composants de référence d’Economiz (page de développement).</p>
      </div>

      <Section title="Couleurs">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Primaire', 'bg-primary'],
            ['Favorable', 'bg-success'],
            ['Vigilance', 'bg-warning'],
            ['Prioritaire', 'bg-danger'],
          ].map(([label, cls]) => (
            <div key={label} className="overflow-hidden rounded-lg border border-border">
              <div className={`h-14 ${cls}`} />
              <p className="px-3 py-2 text-sm">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Boutons">
        <div className="flex flex-wrap gap-3">
          <Button>Principal</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="outline">Contour</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="danger">Supprimer</Button>
          <Button variant="link">Lien</Button>
          <Button disabled>Désactivé</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <AsyncButtonDemo outcome="success" />
          <AsyncButtonDemo outcome="error" />
        </div>
      </Section>

      <Section title="Statuts">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="favorable" />
          <StatusBadge status="vigilance" />
          <StatusBadge status="prioritaire" />
          <Badge tone="primary">Nouveau</Badge>
          <Badge>Neutre</Badge>
        </div>
      </Section>

      <Section title="Formulaire">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Montant</CardTitle>
            <CardDescription>Validation en direct via le moteur de calcul.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Loyer mensuel" hint="En euros, charges comprises" error={amountError}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} inputMode="decimal" placeholder="850" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
              )}
            </Field>
          </CardContent>
        </Card>
      </Section>

      <Section title="Messages">
        <div className="max-w-xl space-y-3">
          <Alert tone="info">Vos données sont enregistrées automatiquement.</Alert>
          <Alert tone="success">Votre bilan a été mis à jour.</Alert>
          <Alert tone="error">Le fichier n’a pas pu être lu.</Alert>
        </div>
      </Section>

      <Section title="États d’écran">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <LoadingState />
          </Card>
          <Card>
            <EmptyState icon={Inbox} title="Aucune opération" description="Importez un relevé pour commencer." />
          </Card>
          <Card>
            <ErrorState onRetry={() => undefined} />
          </Card>
        </div>
        <Card className="max-w-md space-y-3 p-6">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </Card>
      </Section>
    </Container>
  )
}
