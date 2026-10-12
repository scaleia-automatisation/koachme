import { ArrowRight, FileUp, PencilLine, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Reveal } from '@/components/motion/reveal'
import { useProfile, useUpdateProfile } from '@/features/finance/api'
import { useDocumentTitle } from '@/lib/use-document-title'

const OPTIONS: { path: 'statements' | 'manual'; icon: LucideIcon; title: string; text: string; detail: string; to: string }[] = [
  {
    path: 'statements',
    icon: FileUp,
    title: 'Analyser mes relevés bancaires',
    text: 'Importez un ou plusieurs relevés PDF. Vos opérations sont classées automatiquement.',
    detail: 'Le plus précis · environ 3 minutes',
    to: '/app/releves?parcours=1',
  },
  {
    path: 'manual',
    icon: PencilLine,
    title: 'Renseigner mes revenus et mes dépenses',
    text: 'Indiquez vos principaux montants, sans relevé. Vous pourrez en ajouter plus tard.',
    detail: 'Sans document · environ 5 minutes',
    to: '/app/budget?etape=revenus&parcours=1',
  },
]

export function WelcomePage() {
  useDocumentTitle('Bienvenue')
  const navigate = useNavigate()
  const profile = useProfile()
  const update = useUpdateProfile()

  const choose = (option: (typeof OPTIONS)[number]) =>
    update.mutate({ onboarding_path: option.path }, { onSuccess: () => navigate(option.to) })

  return (
    <Container className="max-w-3xl py-10 sm:py-16">
      <Reveal>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Bienvenue{profile.data?.display_name ? `, ${profile.data.display_name}` : ''} 👋
        </h1>
        <p className="mt-2 text-muted-foreground">Comment souhaitez-vous commencer votre bilan ? Les deux options mènent au même résultat.</p>
      </Reveal>

      <div className="mt-8 grid gap-4">
        {OPTIONS.map((o, i) => (
          <Reveal key={o.path} delay={i * 0.06}>
            <button
              type="button"
              onClick={() => choose(o)}
              disabled={update.isPending}
              className="group flex w-full items-start gap-4 rounded-2xl border border-border bg-surface p-5 text-left shadow-card transition-all hover:border-primary/50 hover:shadow-raised disabled:opacity-60 sm:p-6"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <o.icon className="size-6" aria-hidden />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-primary">Option {i === 0 ? 'A' : 'B'}</p>
                <h2 className="mt-0.5 text-lg font-semibold">{o.title}</h2>
                <p className="mt-1 text-[0.9375rem] text-muted-foreground">{o.text}</p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">{o.detail}</p>
              </div>
              <ArrowRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden />
            </button>
          </Reveal>
        ))}
      </div>

      {update.isError && <Alert tone="error" className="mt-4">Votre choix n’a pas pu être enregistré. Réessayez.</Alert>}
      <p className="mt-6 text-center text-xs text-muted-foreground">Nous ne vous demanderons jamais vos identifiants bancaires.</p>
    </Container>
  )
}
