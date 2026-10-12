import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Calculator,
  FileUp,
  GraduationCap,
  HeartHandshake,
  LineChart,
  ListChecks,
  Lock,
  MessageCircle,
  PencilLine,
  PiggyBank,
  Scissors,
  ShieldAlert,
  Target,
  Users,
  Briefcase,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE } from '@/components/brand/logo'
import { Alert } from '@/components/feedback/states'
import { CallToAction } from '@/features/public/page-parts'
import { useDocumentTitle } from '@/lib/use-document-title'
import { Container } from '@/components/layout/container'
import { Reveal } from '@/components/motion/reveal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BilanPreview } from './bilan-preview'

const START_PATHS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: FileUp,
    title: 'Importer mes relevés',
    text: 'Déposez vos relevés bancaires : vos opérations sont classées automatiquement par catégorie.',
  },
  {
    icon: PencilLine,
    title: 'Saisir mes montants',
    text: 'Pas de relevé sous la main ? Indiquez vos revenus et vos charges principales en quelques minutes.',
  },
]

const STEPS: { title: string; text: string }[] = [
  { title: 'Vos revenus', text: 'Salaire, activité, aides : ce qui entre chaque mois.' },
  { title: 'Vos charges', text: 'Logement, crédits, courses, abonnements : ce qui sort.' },
  { title: 'Votre bilan', text: 'Votre situation en clair et des actions concrètes, chiffrées.' },
]

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BarChart3, title: 'Où va votre argent', text: 'Chaque dépense rangée dans une catégorie claire.' },
  { icon: Scissors, title: 'Les dépenses à réduire', text: 'Les postes évitables repérés, avec le gain possible.' },
  { icon: ShieldAlert, title: 'Les difficultés anticipées', text: 'Une alerte avant que le mois ne devienne difficile.' },
  { icon: Target, title: 'Des objectifs d’épargne', text: 'Un montant, une date, et le chemin pour y arriver.' },
  { icon: LineChart, title: 'Un suivi mois après mois', text: 'Votre progression visible dans le temps.' },
  { icon: MessageCircle, title: 'Un coach qui vous répond', text: 'Des réponses fondées sur vos propres chiffres.' },
]

const AUDIENCES: { icon: LucideIcon; title: string }[] = [
  { icon: Wallet, title: 'Celles et ceux qui ont du mal à finir le mois' },
  { icon: Briefcase, title: 'Salariés, indépendants et entrepreneurs' },
  { icon: GraduationCap, title: 'Étudiants et jeunes actifs' },
  { icon: Users, title: 'Familles qui veulent mieux gérer leurs dépenses' },
  { icon: PiggyBank, title: 'Toute personne qui veut épargner ou réduire ses dettes' },
]

const TRUST: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Calculator,
    title: 'Des calculs fiables',
    text: 'Vos chiffres sont calculés par un moteur déterministe. L’intelligence artificielle explique, elle n’invente rien.',
  },
  {
    icon: Lock,
    title: 'Des données protégées',
    text: 'Vos informations sont chiffrées, isolées de celles des autres utilisateurs et ne sont jamais revendues.',
  },
  {
    icon: HeartHandshake,
    title: 'Sans jargon',
    text: 'Chaque écran tient en une idée et une action. Aucune connaissance financière n’est nécessaire.',
  },
]

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {text && <p className="mt-3 text-muted-foreground text-pretty">{text}</p>}
    </div>
  )
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <Icon className="size-5" aria-hidden />
    </div>
  )
}

export function LandingPage() {
  useDocumentTitle('')
  const [params] = useSearchParams()
  return (
    <>
      {params.get('compte') === 'supprime' && (
        <Container className="pt-6">
          <Alert tone="success">Votre compte et toutes vos données ont été supprimés.</Alert>
        </Container>
      )}
      {/* Hero */}
      <section className="overflow-hidden">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          {/* Haut de page affiché immédiatement (pas d'animation d'apparition) : il détermine le temps d'affichage perçu. */}
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <ListChecks className="size-3.5 text-primary" aria-hidden />
              Votre coach budgétaire personnel
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{APP_TAGLINE}</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
              {APP_NAME} analyse vos revenus et vos dépenses, repère ce qui peut être réduit et vous aide à épargner
              chaque mois. Simplement, et sans jargon.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/inscription">
                  Faire mon bilan gratuit
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#fonctionnement">
                  Voir comment ça marche
                  <ArrowDown aria-hidden />
                </a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Gratuit, sans carte bancaire. Jamais d’identifiants bancaires.</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <BilanPreview />
          </div>
        </Container>
      </section>

      {/* Fonctionnement */}
      <section id="fonctionnement" className="scroll-mt-16 border-y border-border bg-surface py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionTitle
              eyebrow="Comment ça marche"
              title="Deux façons de commencer, un bilan en trois étapes"
              text="Avec ou sans relevé bancaire, vous obtenez une vue claire de votre situation en quelques minutes."
            />
          </Reveal>

          <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
            {START_PATHS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.06}>
                <Card className="h-full p-6">
                  <IconTile icon={p.icon} />
                  <h3 className="mt-4 font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{p.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <ol className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.06} className="flex gap-4 sm:flex-col sm:gap-3">
                  <span className="tabular flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                  </div>
              </Reveal>
            ))}
          </ol>
        </Container>
      </section>

      {/* Fonctionnalités */}
      <section className="py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionTitle eyebrow="Ce que vous obtenez" title="Comprendre, agir, progresser" />
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.05}>
                <div className="flex h-full gap-4 rounded-xl p-4 transition-colors hover:bg-surface">
                  <IconTile icon={f.icon} />
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Pour qui */}
      <section id="pour-qui" className="scroll-mt-16 border-y border-border bg-surface py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionTitle
              eyebrow="Pour qui"
              title="Pensé pour tout le monde, surtout pour ceux qui n’aiment pas les chiffres"
            />
          </Reveal>
          <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map((a, i) => (
              <Reveal as="li" key={a.title} delay={(i % 3) * 0.05} className="flex h-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium">
                <a.icon className="size-5 shrink-0 text-primary" aria-hidden />
                {a.title}
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      {/* Confiance */}
      <section id="confiance" className="scroll-mt-16 py-16 sm:py-24">
        <Container>
          <Reveal>
            <SectionTitle eyebrow="Confiance" title="Vos finances méritent de la rigueur" />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {TRUST.map((t, i) => (
              <Reveal key={t.title} delay={i * 0.06}>
                <Card className="h-full p-6">
                  <IconTile icon={t.icon} />
                  <h3 className="mt-4 font-semibold">{t.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
      <CallToAction />
    </>
  )
}
