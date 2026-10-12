// Données de l'espace d'administration. Chaque requête est contrôlée côté base
// (rôle vérifié dans les fonctions SECURITY DEFINER et dans les politiques RLS) :
// l'interface ne fait qu'afficher ce que le serveur accepte de renvoyer.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Plan, PlanLimits } from '@/features/finance/billing'
import { supabase } from '@/lib/supabase'

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export interface AdminOverview {
  users_total: number
  signups_7d: number
  signups_30d: number
  active_30d: number
  subscriptions_active: number
  subscriptions_past_due: number
  mrr_cents: number
  imports_30d: Record<string, number> | null
  coach_requests_30d: number
  coach_tokens_30d: number
  goals_total: number
  support_open: number
  errors_24h: number
}

export const useAdminOverview = () => useQuery({ queryKey: ['admin', 'overview'], queryFn: () => rpc<AdminOverview>('admin_overview') })

export const useSignupsSeries = (days = 30) =>
  useQuery({ queryKey: ['admin', 'signups', days], queryFn: () => rpc<{ day: string; signups: number }[]>('admin_signups_series', { p_days: days }) })

export const useAiUsage = (days = 30) =>
  useQuery({
    queryKey: ['admin', 'ai', days],
    queryFn: () => rpc<{ day: string; requests: number; tokens: number; fallbacks: number; users: number }[]>('admin_ai_usage', { p_days: days }),
  })

export interface FailedImport {
  id: string
  created_at: string
  error_code: string | null
  attempts: number
  file_size: number
  extraction_method: string | null
  user_id: string
}
export const useFailedImports = () => useQuery({ queryKey: ['admin', 'failed_imports'], queryFn: () => rpc<FailedImport[]>('admin_failed_imports', { p_limit: 100 }) })

export interface AppLog {
  id: number
  level: 'info' | 'warn' | 'error'
  source: string
  code: string
  message: string | null
  context: Record<string, unknown>
  created_at: string
}
export function useAppLogs(level: 'all' | 'error' | 'warn') {
  return useQuery({
    queryKey: ['admin', 'logs', level],
    queryFn: async () => {
      let q = supabase.from('app_logs').select('*').order('created_at', { ascending: false }).limit(200)
      if (level !== 'all') q = q.eq('level', level)
      const { data, error } = await q
      if (error) throw error
      return data as AppLog[]
    },
  })
}

// ---------------------------------------------------------------------------
// Offres et limites (administrateur)
// ---------------------------------------------------------------------------

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('sort_order')
      if (error) throw error
      return data as Required<Plan>[]
    },
  })
}

export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string
      name: string
      tagline: string
      monthly_price_cents: number
      yearly_price_cents: number | null
      stripe_price_monthly: string | null
      stripe_price_yearly: string | null
      limits: PlanLimits
      features: string[]
      highlighted: boolean
      is_active: boolean
    }) => {
      const { id, ...patch } = p
      const { error } = await supabase.from('plans').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      void qc.invalidateQueries({ queryKey: ['plans'] })
    },
  })
}

// ---------------------------------------------------------------------------
// FAQ (administrateur)
// ---------------------------------------------------------------------------

export interface FaqItem {
  id: string
  section: string
  question: string
  answer: string
  sort_order: number
  is_published: boolean
}

export function useAdminFaq() {
  return useQuery({
    queryKey: ['admin', 'faq'],
    queryFn: async () => {
      const { data, error } = await supabase.from('faq_items').select('id, section, question, answer, sort_order, is_published').order('sort_order')
      if (error) throw error
      return data as FaqItem[]
    },
  })
}

export function useSaveFaq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Omit<FaqItem, 'id'> & { id?: string }) => {
      const { id, ...row } = item
      const { error } = id ? await supabase.from('faq_items').update(row).eq('id', id) : await supabase.from('faq_items').insert(row)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'faq'] })
      void qc.invalidateQueries({ queryKey: ['faq_items'] })
    },
  })
}

export function useDeleteFaq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('faq_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'faq'] })
      void qc.invalidateQueries({ queryKey: ['faq_items'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Assistance
// ---------------------------------------------------------------------------

export type SupportStatus = 'new' | 'in_progress' | 'resolved'

export interface SupportRequest {
  id: string
  user_id: string | null
  name: string
  email: string
  topic: string
  message: string
  created_at: string
  status: SupportStatus
  assigned_to: string | null
  internal_note: string | null
  resolved_at: string | null
}

export function useSupportRequests(status: SupportStatus | 'open' | 'all') {
  return useQuery({
    queryKey: ['admin', 'support', status],
    queryFn: async () => {
      let q = supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200)
      if (status === 'open') q = q.neq('status', 'resolved')
      else if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return data as SupportRequest[]
    },
  })
}

export function useUpdateSupportRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: SupportStatus; internal_note?: string | null; assigned_to?: string | null }) => {
      const row = { ...patch, ...(patch.status ? { resolved_at: patch.status === 'resolved' ? new Date().toISOString() : null } : {}) }
      const { error } = await supabase.from('contact_messages').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'support'] }),
  })
}

export interface FoundUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  plan: string
  has_active_grant: boolean
}

/** Recherche exacte par email (journalisée côté serveur). */
export const findUser = async (email: string) => (await rpc<FoundUser[]>('admin_find_user', { p_email: email }))[0] ?? null

export interface SupportOverview {
  email: string
  created_at: string
  plan: string
  onboarding_path: string | null
  imports: { id: string; status: string; error_code: string | null; created_at: string; period_start: string | null; period_end: string | null; operations_count: number; balance_check: string | null; extraction_method: string | null; attempts: number }[]
  budget_lines: number
  goals: number
  grant_expires_at: string
}

/** Vue d'assistance : exige l'accord en cours de l'utilisateur, consultation journalisée. */
export const supportUserOverview = (userId: string) => rpc<SupportOverview>('support_user_overview', { p_user: userId })

// ---------------------------------------------------------------------------
// Sécurité et équipe (administrateur)
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: number
  actor_id: string | null
  action: string
  target_user_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export function useAuditLogs(prefix: string) {
  return useQuery({
    queryKey: ['admin', 'audit', prefix],
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
      if (prefix) q = q.like('action', `${prefix}.%`)
      const { data, error } = await q
      if (error) throw error
      return data as AuditLog[]
    },
  })
}

export interface StaffMember {
  user_id: string
  email: string
  role: 'admin' | 'support'
  granted_at: string
}

export const useStaff = () => useQuery({ queryKey: ['admin', 'staff'], queryFn: () => rpc<StaffMember[]>('admin_staff') })

export function useSetRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { email: string; role: 'admin' | 'support'; grant: boolean }) => rpc<void>('admin_set_role', { p_email: args.email, p_role: args.role, p_grant: args.grant }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'staff'] })
      void qc.invalidateQueries({ queryKey: ['my_roles'] })
    },
  })
}

/** Message lisible pour une erreur renvoyée par une fonction d'administration. */
export function adminErrorMessage(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? ''
  if (message.includes('forbidden') || message.includes('row-level security')) return 'Action réservée à un autre rôle.'
  if (message.includes('no_active_grant')) return 'L’utilisateur n’a pas accordé d’accès à l’assistance, ou son accord a expiré.'
  if (message.includes('user_not_found')) return 'Aucun compte ne correspond à cet email.'
  if (message.includes('cannot_revoke_self')) return 'Vous ne pouvez pas retirer votre propre rôle d’administrateur.'
  if (message.includes('plans_limits_shape') || message.includes('check constraint')) return 'Valeur refusée par la base : vérifiez les montants et identifiants.'
  return 'L’opération a échoué. Réessayez.'
}
