// Parcours A : import d'un ou plusieurs relevés PDF, suivi de la progression
// et liste des relevés déjà importés.
import { AlertTriangle, CalendarRange, CheckCircle2, Download, FileText, Loader2, PlusCircle, RefreshCw, Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/feedback/states'
import { Container } from '@/components/layout/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Progress } from '@/components/ui/form-controls'
import {
  AlreadyImportedError,
  isPending,
  PlanLimitError,
  MAX_FILE_SIZE,
  startProcessing,
  statementDownloadUrl,
  uploadStatement,
  useDeleteImport,
  useImports,
  type StatementImport,
} from '@/features/finance/api'
import { billingKeys, useEntitlements } from '@/features/finance/billing'
import { useAuth } from '@/lib/use-auth'
import { useDocumentTitle } from '@/lib/use-document-title'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { formatPeriod, IMPORT_ERRORS } from './import-meta'
import { UpgradeCard } from './premium'

const MAX_FILES = 12

interface LocalUpload {
  key: string
  name: string
  state: 'uploading' | 'error'
  error?: string
}

function validate(file: File): string | null {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Ce fichier n’est pas un PDF.'
  if (file.size === 0) return 'Ce fichier est vide.'
  if (file.size > MAX_FILE_SIZE) return 'Fichier trop volumineux (10 Mo maximum).'
  return null
}

function ImportStatus({ imp }: { imp: StatementImport }) {
  switch (imp.status) {
    case 'uploaded':
    case 'processing':
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin-fast text-primary" aria-hidden />
            {imp.status === 'uploaded' ? 'Vérification du fichier…' : 'Lecture et classement des opérations…'}
          </p>
          <Progress value={imp.status === 'uploaded' ? 35 : 70} label={`Progression de l’import ${imp.file_name}`} />
        </div>
      )
    case 'needs_review':
      return imp.balance_check === 'mismatch' ? <Badge tone="danger">Écart de solde · à vérifier</Badge> : <Badge tone="warning">À vérifier</Badge>
    case 'confirmed':
      return (
        <Badge tone="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Validé
        </Badge>
      )
    case 'failed':
      return <Badge tone="danger">Échec</Badge>
  }
}

function ImportCard({ imp }: { imp: StatementImport }) {
  const del = useDeleteImport()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  // Lien signé valable 60 secondes, généré à la demande : le stockage reste privé.
  const download = async () => {
    setDownloading(true)
    setDownloadError(false)
    try {
      window.open(await statementDownloadUrl(imp.file_path), '_blank', 'noopener')
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }
  const [retrying, setRetrying] = useState(false)
  const [ocrConsent, setOcrConsent] = useState(false)
  const error = imp.status === 'failed' ? (IMPORT_ERRORS[imp.error_code ?? 'processing_error'] ?? IMPORT_ERRORS.processing_error) : null

  const retry = async (allowOcr = false) => {
    setRetrying(true)
    try {
      await startProcessing(imp.id, allowOcr)
    } finally {
      setRetrying(false)
      void qc.invalidateQueries({ queryKey: ['imports'] })
      void qc.invalidateQueries({ queryKey: billingKeys.entitlements })
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileText className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="truncate font-medium">{imp.account_label ?? imp.file_name}</p>
            <ImportStatus imp={imp} />
          </div>
          <p className="text-sm text-muted-foreground">
            {imp.account_label && <span className="mr-2 break-all">{imp.file_name}</span>}
            {imp.period_start && imp.period_end && <span className="mr-2">{formatPeriod(imp.period_start, imp.period_end)}</span>}
            {imp.operations_count > 0 && <span>{imp.operations_count} opérations</span>}
          </p>
          {error && (
            <Alert tone="error">
              <p className="font-medium">{error.title}</p>
              <p className="text-muted-foreground">{error.advice}</p>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {imp.status === 'needs_review' && (
              <Button asChild size="sm">
                <Link to={`/app/releves/${imp.id}`}>Vérifier et valider</Link>
              </Button>
            )}
            {imp.status === 'confirmed' && (
              <Button asChild size="sm" variant="outline">
                <Link to={`/app/releves/${imp.id}`}>Voir les opérations</Link>
              </Button>
            )}
            {imp.status === 'failed' && imp.error_code === 'needs_ocr' && (
              <div className="w-full space-y-2 rounded-lg border border-border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={ocrConsent} onChange={(e) => setOcrConsent(e.target.checked)} />
                  <span>
                    J’accepte que ce document soit transmis tel quel à notre prestataire d’IA pour être lu. Contrairement aux relevés texte, son contenu (nom, numéro de compte) ne peut pas être masqué
                    au préalable ; seuls les 4 derniers chiffres du compte sont conservés.
                  </span>
                </label>
                <Button size="sm" disabled={!ocrConsent} onClick={() => void retry(true)} state={retrying ? 'loading' : 'idle'}>
                  Lire ce document (OCR)
                </Button>
              </div>
            )}
            {imp.status === 'failed' && error?.retryable && (
              <Button size="sm" variant="outline" onClick={() => void retry()} state={retrying ? 'loading' : 'idle'}>
                <RefreshCw aria-hidden />
                Réessayer
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => void download()}
              state={downloading ? 'loading' : 'idle'}
              title="Lien temporaire et sécurisé (60 secondes)"
            >
              <Download aria-hidden />
              Télécharger
            </Button>
            {!isPending(imp.status) && !confirmDelete && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                Supprimer
              </Button>
            )}
          </div>
          {confirmDelete && (
            <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-soft/50 p-3 text-sm">
              <p className="font-medium">Supprimer ce relevé ?</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Le fichier et {imp.operations_count > 0 ? `ses ${imp.operations_count} opérations` : 'ses opérations'} seront définitivement supprimés.</li>
                {(imp.status === 'needs_review' || imp.status === 'confirmed') && (
                  <li>Votre bilan sera recalculé sans ces opérations (les montants que vous avez déclarés redeviennent pris en compte pour les catégories concernées).</li>
                )}
                <li>Vos corrections de catégories mémorisées par marchand sont conservées.</li>
              </ul>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" state={del.isPending ? 'loading' : 'idle'} onClick={() => del.mutate(imp)}>
                  Supprimer définitivement
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
          {del.isError && <p className="text-xs font-medium text-danger">La suppression a échoué, réessayez.</p>}
          {downloadError && <p className="text-xs font-medium text-danger">Le téléchargement a échoué, réessayez.</p>}
        </div>
      </div>
    </Card>
  )
}

export function StatementsPage() {
  useDocumentTitle('Mes relevés')
  const { user } = useAuth()
  const qc = useQueryClient()
  const imports = useImports()
  const ent = useEntitlements()
  const [params] = useSearchParams()
  const onboarding = params.get('parcours') === '1'
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<LocalUpload[]>([])
  const [dragging, setDragging] = useState(false)
  const [selectionError, setSelectionError] = useState<string | null>(null)

  async function handleFiles(list: FileList | null) {
    if (!list?.length || !user) return
    const files = [...list]
    setSelectionError(files.length > MAX_FILES ? `Importez au maximum ${MAX_FILES} fichiers à la fois.` : null)
    for (const file of files.slice(0, MAX_FILES)) {
      const key = crypto.randomUUID()
      const problem = validate(file)
      if (problem) {
        setUploads((u) => [...u, { key, name: file.name, state: 'error', error: problem }])
        continue
      }
      setUploads((u) => [...u, { key, name: file.name, state: 'uploading' }])
      try {
        await uploadStatement(user.id, file)
        setUploads((u) => u.filter((x) => x.key !== key))
      } catch (e) {
        const message =
          e instanceof AlreadyImportedError
            ? `Ce fichier a déjà été importé le ${new Date(e.existing.created_at).toLocaleDateString('fr-FR')} (« ${e.existing.file_name} »).`
            : e instanceof PlanLimitError
              ? 'Limite mensuelle de votre offre atteinte : ce relevé n’a pas été conservé.'
              : 'L’envoi a échoué. Vérifiez votre connexion et réessayez.'
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: 'error', error: message } : x)))
      }
      void qc.invalidateQueries({ queryKey: ['imports'] })
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }

  const list = imports.data ?? []
  const toReview = list.filter((i) => i.status === 'needs_review')
  // Périodes couvertes par compte (relevés analysés), triées chronologiquement.
  const coverageMap = new Map<string, { start: string; end: string }[]>()
  for (const i of list) {
    if ((i.status !== 'needs_review' && i.status !== 'confirmed') || !i.period_start || !i.period_end) continue
    const key = i.account_label ?? i.file_name
    coverageMap.set(
      key,
      [...(coverageMap.get(key) ?? []), { start: i.period_start, end: i.period_end }].sort((a, b) => a.start.localeCompare(b.start)),
    )
  }
  const coverage = [...coverageMap.entries()].map(([account, periods]) => ({
    account,
    periods,
  }))
  const processing = list.some((i) => isPending(i.status)) || uploads.some((u) => u.state === 'uploading')

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Mes relevés bancaires</h1>
      <p className="mt-2 text-muted-foreground">Importez vos relevés de compte au format PDF. Deux ou trois mois donnent un bilan plus fiable. Ajoutez autant de comptes que nécessaire.</p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'mt-6 flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
        )}
      >
        <UploadCloud className="size-10 text-primary" aria-hidden />
        <p className="mt-3 font-medium">Déposez vos relevés PDF ici</p>
        <p className="mt-1 text-sm text-muted-foreground">ou</p>
        <Button className="mt-3" onClick={() => inputRef.current?.click()}>
          Choisir des fichiers
        </Button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Choisir des relevés PDF" onChange={(e) => void handleFiles(e.target.files)} />
        <p className="mt-4 text-xs text-muted-foreground">PDF téléchargés depuis votre banque en ligne · 10 Mo maximum · relevés scannés lus par OCR avec votre accord</p>
      </div>

      {selectionError && (
        <Alert tone="error" className="mt-4">
          {selectionError}
        </Alert>
      )}

      {ent.data &&
        ent.data.limits.statement_imports_per_month !== null &&
        ent.data.usage.statement_imports_this_month >= ent.data.limits.statement_imports_per_month &&
        (ent.data.plan === 'free' ? (
          <UpgradeCard className="mt-4" title="Vous avez atteint la limite de relevés analysés ce mois-ci">
            Avec Premium, importez tous vos comptes et vos relevés précédents pour un bilan plus précis et un historique complet.
          </UpgradeCard>
        ) : (
          <Alert tone="info" className="mt-4">
            Vous avez atteint la limite de {ent.data.limits.statement_imports_per_month} relevés analysés ce mois-ci. Le compteur repart à zéro le 1er du mois prochain.
          </Alert>
        ))}

      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.key} className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{u.name}</span>
                {u.state === 'uploading' ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin-fast" aria-hidden />
                    Envoi…
                  </span>
                ) : (
                  <button className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
                    Fermer
                  </button>
                )}
              </div>
              {u.state === 'uploading' && <Progress value={15} label={`Envoi de ${u.name}`} className="mt-2" />}
              {u.error && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-danger">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {u.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {toReview.length > 0 && (
        <Alert tone="info" className="mt-6">
          <p className="font-medium">{toReview.length === 1 ? 'Un relevé est prêt à être vérifié.' : `${toReview.length} relevés sont prêts à être vérifiés.`}</p>
          <p className="text-muted-foreground">Seules les opérations ambiguës vous seront soumises.</p>
        </Alert>
      )}

      {coverage.length > 0 && (
        <section className="mt-8" aria-labelledby="periodes">
          <h2 id="periodes" className="flex items-center gap-2 text-lg font-semibold">
            <CalendarRange className="size-5 text-primary" aria-hidden /> Périodes couvertes
          </h2>
          <ul className="mt-3 space-y-2">
            {coverage.map((c) => (
              <li key={c.account} className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
                <p className="font-medium">{c.account}</p>
                <p className="text-muted-foreground">{c.periods.map((p) => formatPeriod(p.start, p.end)).join(' · ')}</p>
              </li>
            ))}
          </ul>
          <Link to="/app/budget?mode=hors-releves&etape=revenus" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <PlusCircle className="size-4" aria-hidden /> Ajouter des revenus absents de mes relevés
          </Link>
        </section>
      )}

      <section className="mt-8" aria-labelledby="liste-releves">
        <div className="flex items-center justify-between">
          <h2 id="liste-releves" className="text-lg font-semibold">
            Relevés importés
          </h2>
          {processing && <span className="text-xs text-muted-foreground">Mise à jour automatique…</span>}
        </div>
        <div className="mt-4 space-y-3">
          {imports.isLoading ? (
            <LoadingState />
          ) : imports.error ? (
            <ErrorState onRetry={() => void imports.refetch()} />
          ) : list.length === 0 ? (
            <Card>
              <EmptyState icon={FileText} title="Aucun relevé pour l’instant" description="Vos relevés importés apparaîtront ici avec leur statut." />
            </Card>
          ) : (
            list.map((imp) => <ImportCard key={imp.id} imp={imp} />)
          )}
        </div>
      </section>

      {!onboarding && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Pas de relevé sous la main ?{' '}
          <Link to="/app/budget" className="font-medium text-primary underline-offset-4 hover:underline">
            Saisissez vos montants
          </Link>
        </p>
      )}
      {onboarding && list.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Vous préférez commencer sans relevé ?{' '}
          <Link to="/app/budget?etape=revenus&parcours=1" className="font-medium text-primary underline-offset-4 hover:underline">
            Renseigner mes montants à la main
          </Link>
        </p>
      )}
    </Container>
  )
}
