// Offres, droits et facturation. Les droits viennent TOUJOURS du serveur
// (my_entitlements, déduit des abonnements écrits par le webhook Stripe
// vérifié) : l'interface ne décide jamais qu'une offre est active.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { FALLBACK_PLANS } from '@/config/plans'
import { useAuth } from '@/lib/use-auth'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

export interface PlanLimits {
  max_goals: number | null
  statement_imports_per_month: number | null
  coach_questions_per_month: number | null
  pdf_exports_per_month: number | null
  monthly_history: boolean
  detailed_comparisons: boolean
  advanced_recommendations: boolean
}

export interface Plan {
  id: string
  name: string
  tagline: string
  monthly_price_cents: number
  yearly_price_cents: number | null
  limits: PlanLimits
  features: string[]
  highlighted: boolean
  sort_order: number
  stripe_price_monthly?: string | null
  stripe_price_yearly?: string | null
  is_active?: boolean
  updated_at?: string
}

export interface Entitlements {
  plan: string
  plan_name: string
  limits: PlanLimits
  subscription: {
    status: string
    interval: 'month' | 'year'
    current_period_end: string | null
    cancel_at_period_end: boolean
    plan_id: string
  } | null
  usage: {
    goals: number
    statement_imports_this_month: number
    coach_questions_this_month: number
    pdf_exports_this_month: number
  }
}

export const billingKeys = {
  plans: ['plans'] as const,
  entitlements: ['entitlements'] as const,
  payments: ['payments'] as const,
  notifications: ['notifications'] as const,
}

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, tagline, monthly_price_cents, yearly_price_cents, limits, features, highlighted, sort_order')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Plan[]
    },
  })
}

/** Offres pour l'affichage public : base de données, sinon copie de secours. */
export function usePublicPlans(): Plan[] {
  const plans = usePlans()
  return plans.data?.length ? plans.data : FALLBACK_PLANS
}

export function useEntitlements() {
  const { user } = useAuth()
  return useQuery({
    queryKey: billingKeys.entitlements,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_entitlements')
      if (error) throw error
      return data as Entitlements
    },
  })
}

export interface Payment {
  id: string
  stripe_invoice_id: string
  amount_cents: number
  refunded_cents: number
  currency: string
  status: 'paid' | 'open' | 'failed' | 'refunded' | 'partially_refunded' | 'void'
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
  period_start: string | null
  created_at: string
}

export function usePayments() {
  const { user } = useAuth()
  return useQuery({
    queryKey: billingKeys.payments,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, stripe_invoice_id, amount_cents, refunded_cents, currency, status, hosted_invoice_url, invoice_pdf_url, period_start, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Payment[]
    },
  })
}

/** Code d'erreur renvoyé par une Edge Function (ex. billing_not_configured). */
export async function functionErrorCode(error: unknown): Promise<string | null> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      return body?.error?.code ?? null
    } catch {
      return null
    }
  }
  return null
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (interval: 'month' | 'year') => {
      // La case de demande d'accès immédiat est cochée dans l'interface ; le serveur refuse sans elle.
      const { data, error } = await supabase.functions.invoke('billing-checkout', { body: { plan: 'premium', interval, immediateStart: true } })
      if (error)
        throw Object.assign(new Error('checkout'), {
          code: await functionErrorCode(error),
        })
      window.location.assign((data as { url: string }).url)
    },
  })
}

export function usePortal() {
  return useMutation({
    mutationFn: async (flow: 'manage' | 'cancel' = 'manage') => {
      const { data, error } = await supabase.functions.invoke('billing-portal', { body: { flow } })
      if (error)
        throw Object.assign(new Error('portal'), {
          code: await functionErrorCode(error),
        })
      window.location.assign((data as { url: string }).url)
    },
  })
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export function useNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: billingKeys.notifications,
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('id, kind, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(30)
      if (error) throw error
      return data as AppNotification[]
    },
  })
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.notifications }),
  })
}

/** Journalise un événement de sécurité déclaré par le client (liste fermée côté base). */
export async function logSecurityEvent(action: 'auth.password_changed' | 'auth.mfa_enabled' | 'auth.mfa_disabled' | 'auth.sessions_revoked' | 'data.export') {
  await supabase.rpc('log_security_event', { p_action: action })
}

/** Télécharge le bilan mensuel en PDF (généré côté serveur, quota de l'offre contrôlé par le serveur). */
export async function downloadReportPdf(period: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession()
  const res = await fetch(`${env.supabaseUrl}/functions/v1/report-pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session?.access_token ?? ''}`,
      apikey: env.supabasePublishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ period }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error('report_pdf'), {
      code: body?.error?.code ?? 'server_error',
      message: body?.error?.message,
    })
  }
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `economiz-bilan-${period}.pdf`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useDeleteNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return
      const { error } = await supabase.from('notifications').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.notifications }),
  })
}

/** Rôles d'équipe, lus côté serveur (jamais déduits d'une valeur du navigateur). */
export function useMyRoles() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_roles', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_roles')
      if (error) throw error
      return (data ?? []) as ('admin' | 'support')[]
    },
  })
}
