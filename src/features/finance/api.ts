// Accès aux données de l'espace utilisateur (React Query + Supabase).
// La RLS garantit côté base que chaque requête ne touche que les données de
// l'utilisateur connecté.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ActionStatus,
  CategoryCode,
  DeclaredEntry,
  FinancialGoal,
  FinancialSituation,
  Frequency,
  GoalKind,
  ImportInfo,
  RawTransaction,
  ReviewStatus,
  SavingsGoal,
  SubscriptionVerdict,
} from '@/domain'
import { useAuth } from '@/lib/use-auth'
import { billingKeys, functionErrorCode } from './billing'
import { supabase } from '@/lib/supabase'
import type { MonthlySnapshot } from '@/domain'

export const keys = {
  profile: ['profile'] as const,
  entries: ['budget_entries'] as const,
  situation: ['situation'] as const,
  imports: ['imports'] as const,
  transactions: ['transactions'] as const,
  rules: ['category_rules'] as const,
  goals: ['savings_goals'] as const,
  contributions: ['goal_contributions'] as const,
  actions: ['recommendation_actions'] as const,
  subscriptions: ['subscription_reviews'] as const,
  reports: ['monthly_reports'] as const,
  conversations: ['coach_conversations'] as const,
  reference: ['reference_data'] as const,
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

export interface Profile {
  id: string
  display_name: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  onboarding_path: 'statements' | 'manual' | null
  onboarding_completed_at: string | null
  currency: 'EUR'
  locale: string
  notify_monthly_reminder: boolean
  notify_email: boolean
  coach_retention_days: 30 | 90 | 365 | 730
  created_at: string
}

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.profile,
    enabled: !!user,
    queryFn: async () => check(await supabase.from('profiles').select('*').single()) as Profile,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (patch: Partial<Omit<Profile, 'id'>>) => check(await supabase.from('profiles').update(patch).eq('id', user!.id).select().single()) as Profile,
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  })
}

// ---------------------------------------------------------------------------
// Lignes de budget déclarées
// ---------------------------------------------------------------------------

interface EntryRow {
  id: string
  category_code: string
  label: string | null
  amount_cents: number
  frequency: Frequency
  source: 'manual' | 'off_statement'
}

const toEntry = (r: EntryRow): DeclaredEntry => ({
  id: r.id,
  categoryCode: r.category_code as CategoryCode,
  label: r.label,
  amount: Number(r.amount_cents),
  frequency: r.frequency,
  source: r.source,
})

export function useBudgetEntries() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.entries,
    enabled: !!user,
    queryFn: async () => (check(await supabase.from('budget_entries').select('*').order('created_at')) as EntryRow[]).map(toEntry),
  })
}

export interface EntryDraft {
  id?: string
  categoryCode: CategoryCode
  label: string | null
  amount: number
  frequency: Frequency
  source: 'manual' | 'off_statement'
}

/** Enregistre en une fois les lignes d'une étape : ajouts, modifications et suppressions. */
export function useSaveEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ upserts, deletions }: { upserts: EntryDraft[]; deletions: string[] }) => {
      const toRow = (d: EntryDraft) => ({
        category_code: d.categoryCode,
        label: d.label?.trim() || null,
        amount_cents: d.amount,
        frequency: d.frequency,
        source: d.source,
      })
      const inserts = upserts.filter((d) => !d.id).map(toRow)
      const updates = upserts.filter((d) => d.id)
      if (deletions.length) check(await supabase.from('budget_entries').delete().in('id', deletions))
      if (inserts.length) check(await supabase.from('budget_entries').insert(inserts))
      for (const u of updates) check(await supabase.from('budget_entries').update(toRow(u)).eq('id', u.id!))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.entries }),
  })
}

// ---------------------------------------------------------------------------
// Situation complémentaire
// ---------------------------------------------------------------------------

interface SituationRow {
  savings_available_cents: number | null
  debt_remaining_cents: number | null
  has_payment_delays: boolean | null
  main_goal: FinancialGoal | null
  household_size: number | null
}

export function useSituation() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.situation,
    enabled: !!user,
    queryFn: async (): Promise<FinancialSituation | null> => {
      const row = check(await supabase.from('financial_situations').select('*').maybeSingle()) as SituationRow | null
      if (!row) return null
      return {
        savingsAvailable: row.savings_available_cents === null ? null : Number(row.savings_available_cents),
        debtRemaining: row.debt_remaining_cents === null ? null : Number(row.debt_remaining_cents),
        hasPaymentDelays: row.has_payment_delays,
        mainGoal: row.main_goal,
        householdSize: row.household_size,
      }
    },
  })
}

export function useSaveSituation() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (s: FinancialSituation) => {
      check(
        await supabase.from('financial_situations').upsert({
          user_id: user!.id,
          savings_available_cents: s.savingsAvailable,
          debt_remaining_cents: s.debtRemaining,
          has_payment_delays: s.hasPaymentDelays,
          main_goal: s.mainGoal,
          household_size: s.householdSize,
        }),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.situation }),
  })
}

// ---------------------------------------------------------------------------
// Imports de relevés
// ---------------------------------------------------------------------------

export type ImportStatus = 'uploaded' | 'processing' | 'needs_review' | 'confirmed' | 'failed'

export interface StatementImport {
  id: string
  file_path: string
  file_name: string
  file_size: number
  status: ImportStatus
  error_code: string | null
  bank_name: string | null
  account_label: string | null
  period_start: string | null
  period_end: string | null
  opening_balance_cents: number | null
  closing_balance_cents: number | null
  balance_check: 'ok' | 'mismatch' | 'unknown'
  balance_gap_cents: number | null
  extraction_method: 'text' | 'ocr' | null
  currency: string
  operations_count: number
  confirmed_at: string | null
  created_at: string
}

export const isPending = (s: ImportStatus) => s === 'uploaded' || s === 'processing'

export function useImports() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.imports,
    enabled: !!user,
    queryFn: async () => check(await supabase.from('statement_imports').select('*').order('created_at', { ascending: false })) as StatementImport[],
    // Suivi de la progression tant qu'un import est en cours de traitement.
    refetchInterval: (q) => (q.state.data?.some((i) => isPending(i.status)) ? 2000 : false),
    // Le suivi continue si l'utilisateur change d'onglet pendant l'analyse.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })
}

export function toImportInfo(i: StatementImport): ImportInfo {
  return {
    id: i.id,
    accountKey: i.account_label ?? i.id,
    periodStart: i.period_start,
    periodEnd: i.period_end,
    closingBalance: i.closing_balance_cents === null ? null : Number(i.closing_balance_cents),
    createdAt: i.created_at,
  }
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Empreinte SHA-256 du fichier, pour reconnaître un relevé déjà importé. */
export async function fileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export class AlreadyImportedError extends Error {
  existing: { id: string; file_name: string; created_at: string }
  constructor(existing: { id: string; file_name: string; created_at: string }) {
    super('already_imported')
    this.existing = existing
  }
}

/** Dépose le PDF, crée l'import et lance l'analyse côté serveur. Refuse un fichier déjà importé. */
export async function uploadStatement(userId: string, file: File): Promise<string> {
  const sha = await fileSha256(file)
  const { data: existing } = await supabase.from('statement_imports').select('id, file_name, created_at').eq('file_sha256', sha).maybeSingle()
  if (existing) throw new AlreadyImportedError(existing)

  const path = `${userId}/${crypto.randomUUID()}.pdf`
  const up = await supabase.storage.from('statements').upload(path, file, { contentType: 'application/pdf' })
  if (up.error) throw up.error
  const { data, error } = await supabase
    .from('statement_imports')
    .insert({
      file_path: path,
      file_name: file.name.slice(0, 255),
      file_size: file.size,
      file_sha256: sha,
    })
    .select('id')
    .single()
  if (error) {
    await supabase.storage.from('statements').remove([path])
    throw error
  }
  await startProcessing(data.id)
  return data.id
}

/** Lance (ou relance) l'analyse. allowOcr : accord explicite pour lire un document scanné. */
export async function startProcessing(importId: string, allowOcr = false) {
  const { error } = await supabase.functions.invoke('process-statement', {
    body: { importId, allowOcr },
  })
  if (error) {
    if ((await functionErrorCode(error)) === 'plan_limit_imports') throw new PlanLimitError('imports')
    throw error
  }
}

/** Limite de l'offre atteinte (contrôlée par le serveur). */
export class PlanLimitError extends Error {
  readonly limit: 'imports' | 'goals' | 'coach' | 'pdf'
  constructor(limit: 'imports' | 'goals' | 'coach' | 'pdf') {
    super('plan_limit_' + limit)
    this.limit = limit
  }
}

export function useDeleteImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (imp: StatementImport) => {
      await supabase.storage.from('statements').remove([imp.file_path])
      check(await supabase.from('statement_imports').delete().eq('id', imp.id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.imports })
      qc.invalidateQueries({ queryKey: keys.transactions })
    },
  })
}

export function useUpdateImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { status?: 'confirmed'; account_label?: string } }) => {
      const body = patch.status === 'confirmed' ? { ...patch, confirmed_at: new Date().toISOString() } : patch
      const updated = check(await supabase.from('statement_imports').update(body).eq('id', id).select().single())
      // Valider un relevé vaut confirmation des catégories proposées pour ses opérations.
      if (patch.status === 'confirmed') {
        check(await supabase.from('transactions').update({ review_status: 'confirmed' }).eq('import_id', id).eq('review_status', 'auto'))
      }
      return updated
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.imports })
      qc.invalidateQueries({ queryKey: keys.transactions })
    },
  })
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

interface TransactionRow {
  id: string
  import_id: string
  op_date: string
  label: string
  amount_cents: number
  ai_category_code: string | null
  ai_confidence: number | null
  user_category_code: string | null
  user_excluded: boolean | null
  user_exceptional: boolean | null
  user_amount_cents: number | null
  user_op_date: string | null
  user_label: string | null
  currency: string
  is_pending: boolean
  page: number | null
  review_status: ReviewStatus
}

const PAGE = 1000

export function useTransactions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.transactions,
    enabled: !!user,
    queryFn: async (): Promise<(RawTransaction & { page: number | null })[]> => {
      const rows: TransactionRow[] = []
      for (let from = 0; ; from += PAGE) {
        const page = check(
          await supabase
            .from('transactions')
            .select(
              'id, import_id, op_date, label, amount_cents, currency, is_pending, page, ai_category_code, ai_confidence, user_category_code, user_excluded, user_exceptional, review_status, user_amount_cents, user_op_date, user_label',
            )
            .order('op_date')
            .order('id')
            .range(from, from + PAGE - 1),
        ) as TransactionRow[]
        rows.push(...page)
        if (page.length < PAGE) break
      }
      return rows.map((r) => ({
        id: r.id,
        importId: r.import_id,
        opDate: r.op_date,
        label: r.label,
        amount: Number(r.amount_cents),
        aiCategoryCode: r.ai_category_code,
        aiConfidence: r.ai_confidence,
        userCategoryCode: r.user_category_code,
        userExcluded: r.user_excluded,
        userExceptional: r.user_exceptional,
        currency: r.currency,
        isPending: r.is_pending,
        page: r.page,
        reviewStatus: r.review_status,
        userAmount: r.user_amount_cents === null ? null : Number(r.user_amount_cents),
        userOpDate: r.user_op_date,
        userLabel: r.user_label,
      }))
    },
  })
}

export function useCategoryRules() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.rules,
    enabled: !!user,
    queryFn: async () => {
      const rows = check(await supabase.from('category_rules').select('merchant_key, category_code')) as { merchant_key: string; category_code: string }[]
      return new Map(rows.map((r) => [r.merchant_key, r.category_code]))
    },
  })
}

/**
 * Applique une catégorie à des opérations et la mémorise pour ce marchand :
 * les opérations similaires (présentes et futures) suivront la même règle.
 */
export function useCategorize() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      ids,
      categoryCode,
      merchantKey,
      status = 'corrected',
    }: {
      ids: string[]
      categoryCode: CategoryCode
      merchantKey: string | null
      /** confirmed : catégorie proposée acceptée ; corrected : catégorie modifiée. */
      status?: Exclude<ReviewStatus, 'auto'>
    }) => {
      for (let i = 0; i < ids.length; i += 200) {
        check(
          await supabase
            .from('transactions')
            .update({ user_category_code: categoryCode, review_status: status })
            .in('id', ids.slice(i, i + 200)),
        )
      }
      if (merchantKey && merchantKey.length >= 2) {
        check(await supabase.from('category_rules').upsert({ merchant_key: merchantKey, category_code: categoryCode }, { onConflict: 'user_id,merchant_key' }))
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.transactions })
      qc.invalidateQueries({ queryKey: keys.rules })
    },
  })
}

export function useSetExcluded() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, excluded }: { ids: string[]; excluded: boolean | null }) => {
      check(await supabase.from('transactions').update({ user_excluded: excluded }).in('id', ids))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.transactions }),
  })
}

export function useSetExceptional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, exceptional }: { ids: string[]; exceptional: boolean | null }) => {
      check(await supabase.from('transactions').update({ user_exceptional: exceptional }).in('id', ids))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.transactions }),
  })
}

// ---------------------------------------------------------------------------
// Objectifs d'épargne
// ---------------------------------------------------------------------------

interface GoalRow {
  id: string
  name: string
  kind: GoalKind
  target_cents: number
  saved_cents: number
  monthly_contribution_cents: number | null
  target_date: string | null
  goal_contributions: { amount_cents: number }[]
}

export interface GoalContribution {
  id: string
  goalId: string
  amount: number
  contributedOn: string
  transactionId: string | null
  note: string | null
}

export function useGoals() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.goals,
    enabled: !!user,
    queryFn: async (): Promise<SavingsGoal[]> =>
      (
        check(
          await supabase.from('savings_goals').select('id, name, kind, target_cents, saved_cents, monthly_contribution_cents, target_date, goal_contributions(amount_cents)').order('created_at'),
        ) as GoalRow[]
      ).map((g) => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        targetAmount: Number(g.target_cents),
        savedAmount: Number(g.saved_cents),
        contributionsTotal: g.goal_contributions.reduce((s, c) => s + Number(c.amount_cents), 0),
        monthlyContribution: g.monthly_contribution_cents === null ? null : Number(g.monthly_contribution_cents),
        targetDate: g.target_date,
      })),
  })
}

export function useContributions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.contributions,
    enabled: !!user,
    queryFn: async (): Promise<GoalContribution[]> =>
      (
        check(await supabase.from('goal_contributions').select('id, goal_id, amount_cents, contributed_on, transaction_id, note').order('contributed_on', { ascending: false })) as {
          id: string
          goal_id: string
          amount_cents: number
          contributed_on: string
          transaction_id: string | null
          note: string | null
        }[]
      ).map((c) => ({
        id: c.id,
        goalId: c.goal_id,
        amount: Number(c.amount_cents),
        contributedOn: c.contributed_on,
        transactionId: c.transaction_id,
        note: c.note,
      })),
  })
}

export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: { id?: string; name: string; kind: GoalKind; targetAmount: number; savedAmount: number; monthlyContribution: number | null; targetDate: string | null }) => {
      const row = {
        name: g.name.trim(),
        kind: g.kind,
        target_cents: g.targetAmount,
        saved_cents: g.savedAmount,
        monthly_contribution_cents: g.monthlyContribution,
        target_date: g.targetDate,
      }
      if (g.id) check(await supabase.from('savings_goals').update(row).eq('id', g.id))
      else {
        const res = await supabase.from('savings_goals').insert(row)
        if (res.error?.message.includes('plan_limit_goals')) throw new PlanLimitError('goals')
        check(res)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.goals })
      qc.invalidateQueries({ queryKey: billingKeys.entitlements })
    },
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      check(await supabase.from('savings_goals').delete().eq('id', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.goals })
      qc.invalidateQueries({ queryKey: keys.contributions })
    },
  })
}

/** Contribution confirmée par l'utilisateur (montant libre, éventuellement rattachée à une opération). */
export function useAddContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { goalId: string; amount: number; contributedOn: string; transactionId?: string | null; note?: string | null }) => {
      check(
        await supabase.from('goal_contributions').insert({
          goal_id: c.goalId,
          amount_cents: c.amount,
          contributed_on: c.contributedOn,
          transaction_id: c.transactionId ?? null,
          note: c.note?.trim() || null,
        }),
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.goals })
      qc.invalidateQueries({ queryKey: keys.contributions })
    },
  })
}

export function useDeleteContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      check(await supabase.from('goal_contributions').delete().eq('id', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.goals })
      qc.invalidateQueries({ queryKey: keys.contributions })
    },
  })
}

// ---------------------------------------------------------------------------
// Opérations : corrections des données extraites, téléchargement sécurisé
// ---------------------------------------------------------------------------

export function useCorrectTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, amount, opDate, label }: { id: string; amount: number | null; opDate: string | null; label: string | null }) => {
      check(
        await supabase
          .from('transactions')
          .update({
            user_amount_cents: amount,
            user_op_date: opDate,
            user_label: label,
            review_status: 'corrected',
          })
          .eq('id', id),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.transactions }),
  })
}

/** Lien de téléchargement temporaire (60 s) vers un relevé du stockage privé. */
export async function statementDownloadUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('statements').createSignedUrl(filePath, 60, { download: true })
  if (error || !data) throw error ?? new Error('Lien indisponible')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Suivi des recommandations et avis sur les paiements récurrents
// ---------------------------------------------------------------------------

export function useRecommendationActions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.actions,
    enabled: !!user,
    queryFn: async () => {
      const rows = check(await supabase.from('recommendation_actions').select('rec_key, status, confirmed_saving_cents')) as {
        rec_key: string
        status: ActionStatus
        confirmed_saving_cents: number | null
      }[]
      return new Map(
        rows.map((r) => [
          r.rec_key,
          {
            status: r.status,
            confirmedSaving: r.confirmed_saving_cents === null ? null : Number(r.confirmed_saving_cents),
          },
        ]),
      )
    },
  })
}

export function useSetActionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, status, confirmedSaving = null }: { key: string; status: ActionStatus; confirmedSaving?: number | null }) => {
      check(
        await supabase.from('recommendation_actions').upsert(
          {
            rec_key: key,
            status,
            confirmed_saving_cents: status === 'done' ? confirmedSaving : null,
          },
          { onConflict: 'user_id,rec_key' },
        ),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.actions }),
  })
}

export function useSubscriptionReviews() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.subscriptions,
    enabled: !!user,
    queryFn: async () => {
      const rows = check(await supabase.from('subscription_reviews').select('merchant_key, verdict')) as { merchant_key: string; verdict: SubscriptionVerdict }[]
      return new Map(rows.map((r) => [r.merchant_key, r.verdict]))
    },
  })
}

export function useSetSubscriptionVerdict() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ merchantKey, verdict }: { merchantKey: string; verdict: SubscriptionVerdict | null }) => {
      if (verdict === null) check(await supabase.from('subscription_reviews').delete().eq('merchant_key', merchantKey))
      else check(await supabase.from('subscription_reviews').upsert({ merchant_key: merchantKey, verdict }, { onConflict: 'user_id,merchant_key' }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.subscriptions }),
  })
}

// ---------------------------------------------------------------------------
// Bilans mensuels (instantanés)
// ---------------------------------------------------------------------------

export interface MonthlyReport {
  period: string
  snapshot: MonthlySnapshot
  updated_at: string
}

export function useMonthlyReports() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.reports,
    enabled: !!user,
    queryFn: async () => check(await supabase.from('monthly_reports').select('period, snapshot, updated_at').order('period')) as MonthlyReport[],
  })
}

export function useSaveMonthlyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ period, snapshot }: { period: string; snapshot: MonthlySnapshot }) => {
      check(await supabase.from('monthly_reports').upsert({ period, snapshot }, { onConflict: 'user_id,period' }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.reports }),
  })
}

// ---------------------------------------------------------------------------
// Coach IA
// ---------------------------------------------------------------------------

export interface CoachStructured {
  facts: { text: string; source: string }[]
  estimates: { text: string; basis: string }[]
  suggestions: string[]
  actions: { label: string; route: string }[]
  links: { label: string; route: string }[]
  period_used: string
  data_gaps: string[]
  quota?: { used: number; limit: number | null }
}

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  structured: CoachStructured | null
  is_fallback: boolean
  created_at: string
}

export function useConversations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.conversations,
    enabled: !!user,
    queryFn: async () =>
      check(await supabase.from('coach_conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(50)) as { id: string; title: string; updated_at: string }[],
  })
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: [...keys.conversations, conversationId],
    enabled: !!conversationId,
    queryFn: async () =>
      check(await supabase.from('coach_messages').select('id, role, content, structured, is_fallback, created_at').eq('conversation_id', conversationId!).order('created_at')) as CoachMessage[],
  })
}

export function useAskCoach() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string | null; message: string }) => {
      const { data, error } = await supabase.functions.invoke('coach', {
        body: { conversationId, message },
      })
      if (error)
        throw Object.assign(new Error('coach'), {
          code: await functionErrorCode(error),
        })
      return data as { conversationId: string; message: CoachMessage }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: keys.conversations })
      qc.invalidateQueries({
        queryKey: [...keys.conversations, data.conversationId],
      })
      qc.invalidateQueries({ queryKey: billingKeys.entitlements })
    },
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      check(await supabase.from('coach_conversations').delete().eq('id', id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  })
}

// ---------------------------------------------------------------------------
// Export des données (portabilité)
// ---------------------------------------------------------------------------

const EXPORT_TABLES = [
  'profiles',
  'financial_situations',
  'budget_entries',
  'statement_imports',
  'transactions',
  'category_rules',
  'savings_goals',
  'goal_contributions',
  'recommendation_actions',
  'subscription_reviews',
  'monthly_reports',
  'coach_conversations',
  'coach_messages',
  'bank_accounts',
  'subscriptions',
  'payments',
  'notifications',
  'support_access_grants',
] as const

/** Rassemble toutes les données de l'utilisateur dans un objet JSON téléchargeable. */
export async function exportAllData(): Promise<Record<string, unknown>> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('unauthorized')
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    format: 'economiz-export-v1',
  }
  for (const table of EXPORT_TABLES) {
    const rows: unknown[] = []
    for (let from = 0; ; from += PAGE) {
      const page = check(
        await supabase
          .from(table)
          .select('*')
          // Filtre explicite : un compte d'équipe peut lire d'autres lignes via la RLS.
          .eq(table === 'profiles' ? 'id' : 'user_id', auth.user.id)
          .range(from, from + PAGE - 1),
      ) as unknown[]
      rows.push(...page)
      if (page.length < PAGE) break
    }
    out[table] = rows
  }
  return out
}
