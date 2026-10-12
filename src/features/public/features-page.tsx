import {
  BarChart3,
  Calculator,
  FileUp,
  History,
  LineChart,
  MessageCircle,
  PencilLine,
  Scissors,
  ShieldAlert,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Container } from '@/components/layout/container'
import { Reveal } from '@/components/motion/reveal'
import { Card } from '@/components/ui/card'
import { CallToAction, PageHero } from './page-parts'

const GROUPS: { title: string; text: string; items: { icon: LucideIcon; title: string; text: string }[] }[] = [
  {
    title: 'Démarrer en quelques minutes',
    text: 'Deux façons de commencer, qui mènent au même bilan.',
    items: [
      { icon: FileUp, title: 'Import de relevés PDF', text: 'Déposez un ou plusieurs relevés : les opérations sont lues, classées et vérifiées avec les soldes du relevé.' },
      { icon: PencilLine, title: 'Saisie guidée', text: 'Pas de relevé ? Indiquez vos revenus et vos charges en quatre étapes courtes. Vous pouvez passer les questions que vous ignorez.' },
      { icon: Tags, title: 'Classement automatique', text: 'Loyer, courses, abonnements : chaque opération rejoint la bonne catégorie. Vous ne confirmez que les cas ambigus, regroupés par marchand.' },
    ],
  },
  {
    title: 'Comprendre sa situation',
    text: 'Des chiffres calculés par un moteur déterministe, expliqués simplement.',
    items: [
      { icon: Wallet, title: 'Reste disponible', text: 'Ce qu’il vous reste chaque mois après vos dépenses et votre épargne.' },
      { icon: BarChart3, title: 'Où va votre argent', text: 'Vos dépenses réparties entre charges fixes, dépenses courantes et dépenses réductibles.' },
      { icon: Calculator, title: 'Indicateurs clés', text: 'Taux d’épargne, part des charges fixes et taux d’endettement, comparés aux seuils de référence.' },
    ],
  },
  {
    title: 'Agir et progresser',
    text: 'Chaque diagnostic débouche sur des actions concrètes.',
    items: [
      { icon: Scissors, title: 'Dépenses réductibles', text: 'Les postes sur lesquels agir en premier, avec le gain annuel possible.' },
      { icon: ShieldAlert, title: 'Anticipation', text: 'Un statut clair — favorable, vigilance ou prioritaire — et les raisons qui l’expliquent.' },
      { icon: Target, title: 'Objectifs d’épargne', text: 'Fixez un montant et une échéance ; Economiz calcule l’effort mensuel nécessaire.' },
      { icon: LineChart, title: 'Suivi mensuel', text: 'Ajoutez vos nouveaux relevés et suivez l’évolution de votre situation.' },
      { icon: History, title: 'Vos corrections mémorisées', text: 'Une catégorie corrigée une fois s’applique automatiquement aux prochains imports.' },
      { icon: MessageCircle, title: 'Coach IA', text: 'Posez vos questions : les réponses s’appuient sur vos propres chiffres, sans jargon.' },
    ],
  },
]

export function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Fonctionnalités"
        title="Tout ce qu’il faut pour reprendre la main sur votre budget"
        intro="Economiz transforme vos relevés ou vos réponses en un bilan clair, puis vous guide vers des économies concrètes et mesurables."
      />
      <Container className="space-y-16 py-14 sm:py-20">
        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={group.title}>
            <Reveal>
              <h2 id={group.title} className="text-2xl font-semibold tracking-tight">
                {group.title}
              </h2>
              <p className="mt-2 text-muted-foreground">{group.text}</p>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item, i) => (
                <Reveal key={item.title} delay={(i % 3) * 0.05}>
                  <Card className="h-full p-6">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <item.icon className="size-5" aria-hidden />
                    </div>
                    <h3 className="mt-4 font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{item.text}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </section>
        ))}
      </Container>
      <CallToAction />
    </>
  )
}
