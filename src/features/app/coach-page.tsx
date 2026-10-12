// Coach IA : conversation simple, réponses structurées (faits, estimations,
// suggestions), actions et liens vers les données concernées. Les chiffres
// viennent du moteur Economiz, calculés côté serveur.
import { ArrowRight, Info, Loader2, MessageCircle, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { useAskCoach, useConversationMessages, useConversations, useDeleteConversation, type CoachMessage } from '@/features/finance/api'
import { useEntitlements } from '@/features/finance/billing'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { COACH_SUGGESTIONS } from './coach-suggestions'
import { UpgradeCard } from './premium'

function AssistantMessage({ m }: { m: CoachMessage }) {
  const s = m.structured
  return (
    <div className="space-y-3 rounded-2xl rounded-tl-sm border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" aria-hidden /> Coach Economiz
        </span>
        {m.is_fallback && <Badge tone="warning">Réponse calculée sans IA</Badge>}
      </div>
      <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line">{m.content}</p>
      {s && (
        <>
          {s.facts.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Faits</p>
              <ul className="mt-1 space-y-1 text-sm">
                {s.facts.map((f) => (
                  <li key={f.text}>
                    {f.text} <span className="text-xs text-muted-foreground">— {f.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.estimates.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Estimations</p>
              <ul className="mt-1 space-y-1 text-sm">
                {s.estimates.map((e) => (
                  <li key={e.text}>
                    {e.text} <span className="text-xs text-muted-foreground">— {e.basis}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.suggestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Suggestions</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {s.suggestions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {(s.actions.length > 0 || s.links.length > 0) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {s.actions.map((a) => (
                <Button key={`${a.label}${a.route}`} asChild size="sm">
                  <Link to={a.route}>
                    {a.label} <ArrowRight aria-hidden />
                  </Link>
                </Button>
              ))}
              {s.links.map((l) => (
                <Button key={`${l.label}${l.route}`} asChild size="sm" variant="outline">
                  <Link to={l.route}>{l.label}</Link>
                </Button>
              ))}
            </div>
          )}
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            Données utilisées : {s.period_used || 'non précisé'}
            {s.data_gaps.length > 0 && ` · Manque : ${s.data_gaps.join(', ')}`}
          </p>
        </>
      )}
    </div>
  )
}

export function CoachPage() {
  useDocumentTitle('Coach IA')
  const location = useLocation()
  const conversations = useConversations()
  const [active, setActive] = useState<string | null>(null)
  const messages = useConversationMessages(active)
  const ask = useAskCoach()
  const ent = useEntitlements()
  const coachLimit = ent.data?.limits.coach_questions_per_month
  const coachLocked = coachLimit === 0
  const del = useDeleteConversation()
  const [input, setInput] = useState((location.state as { question?: string } | null)?.question ?? '')
  const [pending, setPending] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.data, pending])

  const send = (text: string) => {
    const message = text.trim()
    if (message.length < 2 || ask.isPending) return
    setPending(message)
    setInput('')
    ask.mutate(
      { conversationId: active, message },
      {
        onSuccess: (data) => setActive(data.conversationId),
        onError: () => setInput(message),
        onSettled: () => setPending(null),
      },
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const list = messages.data ?? []
  const quota = ent.data && coachLimit ? { used: ent.data.usage.coach_questions_this_month, limit: coachLimit } : null
  const askError =
    (ask.error as { code?: string } | null)?.code === 'rate_limited'
      ? 'Vous avez posé beaucoup de questions en peu de temps. Patientez quelques minutes puis réessayez.'
      : 'Le coach n’a pas pu répondre. Vérifiez votre connexion puis réessayez.'

  return (
    <Container className="py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="size-6 text-primary" aria-hidden /> Mon coach IA
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Des réponses fondées sur vos propres chiffres, calculés par Economiz.</p>
        </div>
        {quota && (
          <Badge tone={quota.used >= quota.limit ? 'warning' : 'neutral'}>
            {quota.used} / {quota.limit} questions ce mois-ci
          </Badge>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Historique des conversations" className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={() => setActive(null)}>
            <Plus aria-hidden /> Nouvelle conversation
          </Button>
          {conversations.isLoading ? (
            <LoadingState className="py-6" />
          ) : (
            <ul className="space-y-1">
              {(conversations.data ?? []).map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => setActive(c.id)}
                    className={cn('min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm hover:bg-muted', active === c.id && 'bg-muted font-medium')}
                    aria-current={active === c.id || undefined}
                  >
                    {c.title}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100"
                    aria-label={`Supprimer la conversation « ${c.title} »`}
                    onClick={() => {
                      del.mutate(c.id)
                      if (active === c.id) setActive(null)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section aria-label="Conversation" className="flex min-h-[28rem] flex-col">
          <div className="flex-1 space-y-4" aria-live="polite">
            {coachLocked && !active ? (
              <UpgradeCard title="Le coach IA est inclus dans l’offre Premium">
                Posez vos questions sur votre budget, vos dépenses ou vos objectifs : le coach répond à partir de vos propres chiffres, calculés par Economiz. Votre bilan, vos recommandations
                essentielles et vos objectifs restent accessibles gratuitement.
              </UpgradeCard>
            ) : !active && !pending ? (
              <Card>
                <EmptyState icon={MessageCircle} title="Posez votre question" description="Par exemple :" />
                <div className="flex flex-wrap justify-center gap-2 px-5 pb-6">
                  {COACH_SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      disabled={ask.isPending}
                      className="rounded-full border border-border bg-surface px-3.5 py-2 text-sm hover:border-primary/40 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </Card>
            ) : messages.isLoading ? (
              <LoadingState />
            ) : messages.error ? (
              <ErrorState onRetry={() => void messages.refetch()} />
            ) : (
              list.map((m) =>
                m.role === 'user' ? (
                  <p key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-[0.9375rem] text-primary-foreground">
                    {m.content}
                  </p>
                ) : (
                  <AssistantMessage key={m.id} m={m} />
                ),
              )
            )}
            {pending && (
              <>
                {(!active || !list.some((m) => m.role === 'user' && m.content === pending)) && (
                  <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-[0.9375rem] text-primary-foreground">{pending}</p>
                )}
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin-fast" aria-hidden /> Le coach analyse vos données…
                </p>
              </>
            )}
            {ask.isError && <Alert tone="error">{askError}</Alert>}
            <div ref={endRef} />
          </div>

          {ent.data && !coachLocked && (
            <form onSubmit={submit} className="sticky bottom-20 mt-6 rounded-2xl border border-border bg-surface p-3 shadow-card md:bottom-4">
              <label htmlFor="coach-input" className="sr-only">
                Votre question
              </label>
              <Textarea
                id="coach-input"
                rows={2}
                maxLength={1000}
                placeholder="Posez une question sur votre budget…"
                className="min-h-16 resize-none border-0 focus-visible:ring-0"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  Le coach ne déclenche aucune opération et ne garantit aucun résultat.
                </p>
                <Button type="submit" size="sm" disabled={input.trim().length < 2} state={ask.isPending ? 'loading' : 'idle'} loadingText="Envoi…">
                  <Send aria-hidden /> Envoyer
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </Container>
  )
}
