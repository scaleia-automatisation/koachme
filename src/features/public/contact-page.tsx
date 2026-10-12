import { BookOpen, CreditCard, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Button, type ButtonState } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Select, Textarea } from '@/components/ui/form-controls'
import { EMAIL_RE } from '@/lib/auth-errors'
import { useAuth } from '@/lib/use-auth'
import { supabase } from '@/lib/supabase'
import { PageHero } from './page-parts'

const TOPICS = [
  { value: 'question', label: 'Une question sur Economiz' },
  { value: 'technique', label: 'Un problème technique' },
  { value: 'abonnement', label: 'Mon abonnement' },
  { value: 'donnees', label: 'Mes données personnelles' },
  { value: 'autre', label: 'Autre demande' },
] as const

const HELP = [
  { icon: BookOpen, title: 'Questions fréquentes', text: 'Import, catégories, compte : les réponses rapides.', to: '/faq' },
  { icon: CreditCard, title: 'Abonnement et résiliation', text: 'Changer d’offre, résilier, se rétracter.', to: '/abonnement-resiliation' },
  { icon: ShieldCheck, title: 'Vos données', text: 'Comment elles sont protégées et comment exercer vos droits.', to: '/confidentialite' },
]

type Errors = Partial<Record<'name' | 'email' | 'message', string>>

export function ContactPage() {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', email: user?.email ?? '', topic: 'question', message: '', website: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [rateLimited, setRateLimited] = useState(false)
  const [state, setState] = useState<ButtonState>('idle')
  const [sent, setSent] = useState(false)

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = {}
    if (!form.name.trim()) next.name = 'Indiquez votre nom'
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Indiquez une adresse email valide'
    if (form.message.trim().length < 10) next.message = 'Votre message doit contenir au moins 10 caractères'
    setErrors(next)
    if (Object.keys(next).length) return
    // Champ piège invisible : rempli uniquement par les robots.
    if (form.website) {
      setSent(true)
      return
    }
    setState('loading')
    const { error } = await supabase
      .from('contact_messages')
      .insert({ name: form.name.trim(), email: form.email.trim(), topic: form.topic, message: form.message.trim() })
    if (error) {
      setRateLimited(error.message.includes('rate_limited'))
      setState('error')
      return
    }
    setState('success')
    setSent(true)
  }

  return (
    <>
      <PageHero eyebrow="Contact et assistance" title="Une question ? Nous vous répondons." intro="Notre équipe vous répond par email, en général sous 48 heures ouvrées." />
      <Container className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Trouver une réponse tout de suite</h2>
          {HELP.map((h) => (
            <Link key={h.to} to={h.to} className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40">
              <div className="flex gap-3">
                <h.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="font-medium">{h.title}</p>
                  <p className="text-sm text-muted-foreground">{h.text}</p>
                </div>
              </div>
            </Link>
          ))}
          <p className="pt-2 text-sm text-muted-foreground">
            Nous ne vous demanderons jamais vos identifiants ni vos codes bancaires, ni par email, ni par téléphone.
          </p>
        </div>

        <Card className="p-6 sm:p-8">
          {sent ? (
            <div className="space-y-4">
              <Alert tone="success">
                <p className="font-medium">Message envoyé</p>
                <p className="text-muted-foreground">Merci ! Nous vous répondrons à l’adresse {form.email.trim()}.</p>
              </Alert>
              <Button variant="outline" onClick={() => { setSent(false); setState('idle'); setForm((f) => ({ ...f, message: '' })) }}>
                Envoyer un autre message
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-5">
              <h2 className="text-lg font-semibold">Écrire à l’équipe</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nom" error={errors.name}>
                  {({ id, describedBy, invalid }) => <Input id={id} autoComplete="name" value={form.name} onChange={set('name')} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
                </Field>
                <Field label="Email" error={errors.email}>
                  {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
                </Field>
              </div>
              <Field label="Sujet">
                {({ id }) => (
                  <Select id={id} value={form.topic} onChange={set('topic')}>
                    {TOPICS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Message" error={errors.message} hint="N’indiquez jamais de mot de passe ni de numéro de carte.">
                {({ id, describedBy, invalid }) => <Textarea id={id} maxLength={4000} value={form.message} onChange={set('message')} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
              </Field>
              <div aria-hidden className="absolute -left-[9999px]">
                <label>
                  Site web
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>
              </div>
              {state === 'error' && (
                <Alert tone="error">
                  {rateLimited ? 'Vous avez déjà envoyé plusieurs messages récemment. Merci de patienter une heure avant d’écrire à nouveau.' : 'L’envoi a échoué. Vérifiez votre connexion puis réessayez.'}
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Vos informations sont utilisées uniquement pour répondre à votre demande. <Link to="/confidentialite" className="text-primary underline underline-offset-4">En savoir plus</Link>
              </p>
              <Button type="submit" state={state} loadingText="Envoi…" className="w-full sm:w-auto">
                Envoyer le message
              </Button>
            </form>
          )}
        </Card>
      </Container>
    </>
  )
}
