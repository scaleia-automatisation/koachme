import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'

export function PageHero({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: ReactNode; children?: ReactNode }) {
  useDocumentTitle(title)
  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-12 sm:py-16">
        <div className="max-w-3xl">
          {eyebrow && <p className="text-sm font-semibold text-primary">{eyebrow}</p>}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
          {intro && <p className="mt-4 text-lg text-muted-foreground text-pretty">{intro}</p>}
          {children}
        </div>
      </Container>
    </section>
  )
}

/** Mise en forme des contenus rédigés (pages légales, explications). */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'max-w-3xl text-[0.9375rem] leading-relaxed text-foreground/90',
        '[&_h2]:mt-10 [&_h2]:scroll-mt-20 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2:first-child]:mt-0',
        '[&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground',
        '[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
        '[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function LegalPage({ title, updatedAt, intro, children }: { title: string; updatedAt: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHero title={title} intro={intro}>
        <p className="mt-4 text-sm text-muted-foreground">Dernière mise à jour : {updatedAt}</p>
      </PageHero>
      <Container className="py-12 sm:py-16">
        <Prose>{children}</Prose>
      </Container>
    </>
  )
}

export function CallToAction({ title = 'Prêt à y voir plus clair ?', text = 'Votre premier bilan est gratuit et ne prend que quelques minutes.' }: { title?: string; text?: string }) {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="flex flex-col items-start gap-6 rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-primary-foreground/80">{text}</p>
          </div>
          <Button asChild size="lg" variant="secondary" className="bg-surface text-primary hover:bg-surface/90">
            <Link to="/inscription">Faire mon bilan gratuit</Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}
