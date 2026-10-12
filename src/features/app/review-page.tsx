// Vérification d'un relevé importé : l'utilisateur ne confirme que les
// opérations ambiguës ou importantes, regroupées par marchand. Il peut aussi
// corriger n'importe quelle opération ; chaque correction est mémorisée.
// Chaque opération affiche sa source (page) et son statut de vérification.
import { AlertTriangle, CheckCircle2, ChevronDown, CopyX, EyeOff, PartyPopper, Pencil, Sparkles } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Alert, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Checkbox, Select } from '@/components/ui/form-controls'
import {
  allCategories,
  allGroups,
  findCategory,
  formatEuros,
  groupForReview,
  isCompatible,
  parseEuros,
  type AnalyzedTransaction,
  type CategoryCode,
  type ReviewGroup,
  type Treatment,
} from '@/domain'
import { useCategorize, useCorrectTransaction, useSetExceptional, useSetExcluded, useUpdateImport } from '@/features/finance/api'
import { useAnalysis } from '@/features/finance/use-analysis'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { formatDate, formatPeriod } from './import-meta'

const TREATMENT_LABEL: Record<Treatment, string> = {
  income: 'Revenus',
  expense: 'Dépenses',
  savings: 'Épargne',
  refund: 'Remboursements',
  transfer: 'Virements internes',
  review: 'À vérifier',
  pending: 'En attente',
  excluded: 'Non comptées',
}

function CategorySelect({ value, amount, onChange, label, disabled }: { value: CategoryCode; amount: number; onChange: (c: CategoryCode) => void; label: string; disabled?: boolean }) {
  const options = allCategories().filter((c) => c.code === value || (c.kind !== 'review' && isCompatible(c.code, amount, true)))
  return (
    <Select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as CategoryCode)} className="h-10 text-sm">
      {allGroups().map((g) => {
        const inGroup = options.filter((c) => c.groupCode === g.code)
        return inGroup.length ? (
          <optgroup key={g.code} label={g.label}>
            {inGroup.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </Select>
  )
}

function ReviewGroupCard({ group }: { group: ReviewGroup }) {
  const categorize = useCategorize()
  const exclude = useSetExcluded()
  const suggested = group.categoryCode === 'a_verifier' ? null : group.categoryCode
  const [category, setCategory] = useState<CategoryCode>(group.categoryCode)
  const ids = group.transactions.map((t) => t.id)
  const sample = group.transactions[0]
  const busy = categorize.isPending || exclude.isPending

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium" title={sample.label}>
            {sample.label}
          </p>
          <p className="text-sm text-muted-foreground">
            {group.transactions.length > 1 ? `${group.transactions.length} opérations · ` : `${formatDate(sample.opDate)} · `}
            {group.direction > 0 ? 'crédit' : 'débit'}
            {suggested ? ` · proposition : ${findCategory(suggested).label}` : ' · aucune catégorie sûre'}
          </p>
        </div>
        <p className={cn('tabular font-semibold', group.direction > 0 && 'text-success')}>{formatEuros(group.total * group.direction, { signed: true })}</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <CategorySelect value={category} amount={sample.amount} onChange={setCategory} label={`Catégorie pour ${sample.label}`} disabled={busy} />
        </div>
        <Button
          size="sm"
          className="h-10"
          state={categorize.isPending ? 'loading' : 'idle'}
          disabled={busy || category === 'a_verifier'}
          onClick={() => categorize.mutate({ ids, categoryCode: category, merchantKey: group.merchantKey, status: category === suggested ? 'confirmed' : 'corrected' })}
        >
          Confirmer
        </Button>
        <Button size="sm" variant="ghost" className="h-10 text-muted-foreground" disabled={busy} onClick={() => exclude.mutate({ ids, excluded: true })}>
          <EyeOff aria-hidden />
          Ne pas compter
        </Button>
      </div>
      {(categorize.isError || exclude.isError) && <p className="mt-2 text-xs font-medium text-danger">L’enregistrement a échoué, réessayez.</p>}
    </Card>
  )
}

function TransactionRow({ tx }: { tx: AnalyzedTransaction }) {
  const categorize = useCategorize()
  const exclude = useSetExcluded()
  const exceptional = useSetExceptional()
  const canBeExceptional = tx.treatment === 'income' || tx.treatment === 'expense'
  const [editing, setEditing] = useState(false)
  const notes = [
    tx.isPending && 'en attente',
    tx.isRecurring && 'récurrent',
    tx.transferPairId && 'virement entre vos comptes',
    tx.exceptional && 'exceptionnel',
    tx.excluded && (tx.duplicateOf ? 'doublon ignoré' : 'non compté'),
    tx.reviewStatus === 'corrected' ? 'corrigé par vous' : tx.reviewStatus === 'confirmed' ? 'vérifié' : tx.categorySource === 'history' ? 'selon vos corrections' : null,
    tx.page ? `page ${tx.page}` : null,
  ].filter(Boolean)

  return (
    <li className={cn('grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center', (tx.excluded || tx.isPending) && 'opacity-60')}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={tx.label}>
          {tx.label}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(tx.opDate)}
          {notes.length > 0 && ` · ${notes.join(' · ')}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <span className={cn('tabular mr-auto w-24 shrink-0 text-sm font-semibold sm:mr-0 sm:text-right', tx.amount > 0 && 'text-success')}>{formatEuros(tx.amount, { signed: true })}</span>
        <div className="order-last w-full sm:order-none sm:w-52">
          <CategorySelect
            value={tx.categoryCode}
            amount={tx.amount}
            label={`Catégorie de ${tx.label}`}
            disabled={categorize.isPending}
            onChange={(c) => categorize.mutate({ ids: [tx.id], categoryCode: c, merchantKey: tx.merchantKey, status: 'corrected' })}
          />
        </div>
        {canBeExceptional && (
          <Button
            size="icon"
            variant="ghost"
            className={cn('size-9 shrink-0', tx.exceptional ? 'text-warning' : 'text-muted-foreground')}
            aria-pressed={tx.exceptional}
            aria-label={tx.exceptional ? `Ne plus considérer ${tx.label} comme exceptionnel` : `Marquer ${tx.label} comme exceptionnel`}
            title={tx.exceptional ? 'Exceptionnel : exclu des moyennes mensuelles' : 'Marquer comme exceptionnel (exclu des moyennes mensuelles)'}
            onClick={() => exceptional.mutate({ ids: [tx.id], exceptional: !tx.exceptional })}
          >
            <Sparkles />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label={tx.excluded ? `Compter ${tx.label}` : `Ne pas compter ${tx.label}`}
          title={tx.excluded ? 'Compter cette opération' : 'Ne pas compter cette opération'}
          onClick={() => exclude.mutate({ ids: [tx.id], excluded: !tx.excluded })}
        >
          {tx.excluded ? <CheckCircle2 /> : <EyeOff />}
        </Button>
        <Button size="icon" variant="ghost" className="size-9 shrink-0 text-muted-foreground" aria-label={`Corriger ${tx.label}`} title="Corriger le montant, la date ou le libellé" onClick={() => setEditing((e) => !e)}>
          <Pencil />
        </Button>
      </div>
      {tx.original && (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Lu sur le relevé : {formatDate(tx.original.opDate)} · {tx.original.label} · {formatEuros(tx.original.amount, { signed: true })}
        </p>
      )}
      {editing && <CorrectionForm tx={tx} onDone={() => setEditing(false)} />}
    </li>
  )
}

function CorrectionForm({ tx, onDone }: { tx: AnalyzedTransaction; onDone: () => void }) {
  const correct = useCorrectTransaction()
  const [label, setLabel] = useState(tx.label)
  const [date, setDate] = useState(tx.opDate)
  const [amount, setAmount] = useState((tx.amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }).replace(/ /g, ' '))
  const [error, setError] = useState<string | null>(null)
  const original = tx.original ?? { amount: tx.amount, opDate: tx.opDate, label: tx.label }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const cents = parseEuros(amount)
    if (!cents) return setError('Montant invalide (négatif pour un débit, positif pour un crédit)')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Date invalide')
    if (!label.trim()) return setError('Le libellé est obligatoire')
    setError(null)
    correct.mutate(
      {
        id: tx.id,
        amount: cents === original.amount ? null : cents,
        opDate: date === original.opDate ? null : date,
        label: label.trim() === original.label ? null : label.trim().slice(0, 300),
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-2 rounded-lg bg-muted p-3 sm:col-span-2 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
      <Field label="Libellé">{({ id }) => <Input id={id} className="h-9" maxLength={300} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
      <Field label="Date">{({ id }) => <Input id={id} type="date" className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <Field label="Montant (€)">{({ id }) => <Input id={id} inputMode="decimal" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
      <div className="flex gap-1">
        <Button type="submit" size="sm" state={correct.isPending ? 'loading' : 'idle'}>
          Enregistrer
        </Button>
        {tx.original && (
          <Button type="button" size="sm" variant="ghost" onClick={() => correct.mutate({ id: tx.id, amount: null, opDate: null, label: null }, { onSuccess: onDone })}>
            Rétablir
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
      {(error || correct.isError) && <p className="text-xs font-medium text-danger sm:col-span-4">{error ?? 'L’enregistrement a échoué, réessayez.'}</p>}
      <p className="text-xs text-muted-foreground sm:col-span-4">La valeur lue sur le relevé est conservée ; votre correction est utilisée pour l’analyse.</p>
    </form>
  )
}

function CategoryGroups({ transactions }: { transactions: AnalyzedTransaction[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, AnalyzedTransaction[]>()
    for (const tx of transactions) if (!tx.duplicateOf || !tx.excluded) map.set(tx.categoryCode, [...(map.get(tx.categoryCode) ?? []), tx])
    return [...map.entries()]
      .map(([code, txs]) => ({ code, txs, total: txs.filter((t) => !t.excluded && !t.isPending).reduce((s, t) => s + t.amount, 0) }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  }, [transactions])

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {groups.map((g) => (
        <details key={g.code} className="group px-4 sm:px-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              <span className="truncate font-medium">{findCategory(g.code).label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{g.txs.length}</span>
            </span>
            <span className={cn('tabular shrink-0 font-semibold', g.total > 0 && 'text-success')}>{formatEuros(g.total, { signed: true })}</span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {g.txs.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

/** Une instance par relevé : l'état local (validation, accord) ne passe jamais d'un relevé à l'autre. */
export function ReviewPage() {
  const { id } = useParams()
  return <ReviewContent key={id} id={id} />
}

function ReviewContent({ id }: { id: string | undefined }) {
  const navigate = useNavigate()
  const analysis = useAnalysis()
  const updateImport = useUpdateImport()
  const exclude = useSetExcluded()
  const [confirmed, setConfirmed] = useState(false)
  const [acknowledgedGap, setAcknowledgedGap] = useState(false)
  const imp = analysis.data?.imports.find((i) => i.id === id)
  useDocumentTitle(imp ? `Vérifier ${imp.account_label ?? imp.file_name}` : 'Vérifier un relevé')

  const txs = useMemo(() => (analysis.data?.analyzed ?? []).filter((t) => t.importId === id), [analysis.data, id])
  const reviewGroups = useMemo(() => groupForReview(txs), [txs])
  const duplicates = txs.filter((t) => t.duplicateOf)
  const byTreatment = useMemo(() => {
    const counts = new Map<Treatment, number>()
    txs.forEach((t) => counts.set(t.treatment, (counts.get(t.treatment) ?? 0) + 1))
    return [...counts.entries()]
  }, [txs])

  if (analysis.isLoading) return <LoadingState className="py-24" />
  if (analysis.error) return <ErrorState onRetry={analysis.refetch} className="py-24" />
  if (!imp) return <Navigate to="/app/releves" replace />
  if (imp.status !== 'needs_review' && imp.status !== 'confirmed') return <Navigate to="/app/releves" replace />

  const settled = txs.filter((t) => !t.excluded && !t.isPending)
  const credits = settled.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const debits = settled.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const mismatch = imp.balance_check === 'mismatch'

  const validate = () => updateImport.mutate({ id: imp.id, patch: { status: 'confirmed' } }, { onSuccess: () => setConfirmed(true) })

  if (confirmed) {
    return (
      <Container className="max-w-xl py-12 sm:py-16">
        <Card className="p-6 text-center sm:p-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
            <PartyPopper className="size-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Relevé validé</h1>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">
            Avez-vous des revenus qui n’apparaissent pas sur vos relevés ? Espèces, loyers perçus, aides ou pension versées sur un autre compte…
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild>
              <Link to="/app/budget?mode=hors-releves&etape=revenus">Oui, les ajouter</Link>
            </Button>
            <Button variant="outline" onClick={() => navigate('/app')}>
              Non, voir mon bilan
            </Button>
            <Button asChild variant="ghost">
              <Link to="/app/releves">Importer un autre relevé</Link>
            </Button>
          </div>
        </Card>
      </Container>
    )
  }

  return (
    <Container className="max-w-3xl py-8 pb-36 sm:py-12">
      <Link to="/app/releves" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        ← Mes relevés
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{imp.account_label ?? imp.file_name}</h1>
      <p className="mt-1 text-muted-foreground">
        {imp.period_start && imp.period_end && `${formatPeriod(imp.period_start, imp.period_end)} · `}
        {txs.length} opérations · {imp.currency} · {imp.extraction_method === 'ocr' ? 'lu par reconnaissance de caractères (OCR)' : 'texte du PDF'}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted-foreground">Entrées comptabilisées</dt>
          <dd className="tabular mt-1 text-lg font-semibold text-success">{formatEuros(credits, { signed: true })}</dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-sm text-muted-foreground">Sorties comptabilisées</dt>
          <dd className="tabular mt-1 text-lg font-semibold">{formatEuros(debits, { signed: true })}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {byTreatment.map(([t, n]) => (
          <Badge key={t} tone={t === 'review' ? 'warning' : t === 'excluded' || t === 'pending' ? 'neutral' : 'primary'}>
            {TREATMENT_LABEL[t]} · {n}
          </Badge>
        ))}
      </div>

      <div className="mt-4">
        {imp.balance_check === 'ok' && <Alert tone="success">Lecture vérifiée : les opérations comptabilisées correspondent exactement aux soldes du relevé.</Alert>}
        {imp.balance_check === 'unknown' && <Alert tone="info">Les soldes du relevé n’ont pas pu être lus : la cohérence des montants n’a pas pu être contrôlée.</Alert>}
        {mismatch && (
          <Alert tone="error">
            <p className="font-medium">Écart avec les soldes du relevé{imp.balance_gap_cents ? ` : ${formatEuros(Math.abs(imp.balance_gap_cents))}` : ''}</p>
            <p className="text-muted-foreground">
              Certaines opérations ont pu être mal lues ou manquer. Ce relevé n’est pas compté dans votre bilan tant que vous ne l’avez pas vérifié. Comparez les
              montants importants avec votre relevé avant de le valider, ou supprimez-le et importez une autre version.
            </p>
          </Alert>
        )}
      </div>

      <section className="mt-8" aria-labelledby="a-confirmer">
        <h2 id="a-confirmer" className="flex items-center gap-2 text-lg font-semibold">
          À confirmer
          <Badge tone={reviewGroups.length ? 'warning' : 'success'}>{reviewGroups.reduce((s, g) => s + g.transactions.length, 0)}</Badge>
        </h2>
        {reviewGroups.length ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Ces opérations sont ambiguës ou importantes. Votre choix s’applique à toutes les opérations du même marchand, maintenant et lors de vos prochains imports.
              Une opération « à vérifier » n’est pas comptée tant que vous ne l’avez pas classée.
            </p>
            <div className="mt-4 space-y-3">
              {reviewGroups.map((g) => (
                <ReviewGroupCard key={`${g.merchantKey}|${g.direction}`} group={g} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            Toutes les opérations sont classées.
          </p>
        )}
      </section>

      {duplicates.length > 0 && (
        <section className="mt-8">
          <Alert tone="info">
            <p className="flex items-center gap-1.5 font-medium">
              <CopyX className="size-4" aria-hidden /> {duplicates.length} doublon{duplicates.length > 1 ? 's' : ''} détecté{duplicates.length > 1 ? 's' : ''}
            </p>
            <p className="text-muted-foreground">Ces opérations figurent déjà dans un autre relevé : elles ne sont comptées qu’une fois.</p>
            <Button
              size="sm"
              variant="link"
              className="mt-1"
              onClick={() => exclude.mutate({ ids: duplicates.map((d) => d.id), excluded: duplicates.every((d) => d.excluded) ? false : null })}
            >
              {duplicates.every((d) => d.excluded) ? 'Les compter quand même' : 'Les ignorer à nouveau'}
            </Button>
          </Alert>
        </section>
      )}

      <section className="mt-8" aria-labelledby="par-categorie">
        <h2 id="par-categorie" className="text-lg font-semibold">
          Opérations par catégorie
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ouvrez une catégorie pour corriger une opération, la marquer comme exceptionnelle ou l’exclure du bilan.
        </p>
        <div className="mt-4">
          <CategoryGroups transactions={txs} />
        </div>
      </section>

      {imp.status === 'needs_review' && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 backdrop-blur md:bottom-0">
          <Container className="flex max-w-3xl flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            {mismatch ? (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={acknowledgedGap} onChange={(e) => setAcknowledgedGap(e.target.checked)} />
                J’ai vérifié les montants et je valide ce relevé malgré l’écart.
              </label>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {reviewGroups.length > 0 && <AlertTriangle className="size-4 text-warning" aria-hidden />}
                {reviewGroups.length > 0 ? 'Les opérations non confirmées garderont la catégorie proposée.' : 'Tout est prêt.'}
              </p>
            )}
            <Button
              onClick={validate}
              disabled={mismatch && !acknowledgedGap}
              state={updateImport.isPending ? 'loading' : updateImport.isError ? 'error' : 'idle'}
              errorText="Réessayer"
              loadingText="Validation…"
            >
              Valider ce relevé
            </Button>
          </Container>
        </div>
      )}
    </Container>
  )
}
