// Droits de l'utilisateur, déduits côté serveur des abonnements vérifiés.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface PlanLimits {
  max_goals: number | null
  statement_imports_per_month: number | null
  coach_questions_per_month: number | null
  pdf_exports_per_month: number | null
  monthly_history: boolean
  detailed_comparisons: boolean
  advanced_recommendations: boolean
}

export async function planOf(db: SupabaseClient, userId: string): Promise<{ plan: string; limits: PlanLimits }> {
  const { data, error } = await db.rpc('plan_limits_of', { p_user: userId })
  if (error || !data) throw new Error('Droits indisponibles')
  return data as { plan: string; limits: PlanLimits }
}

/** fetch avec un nouvel essai (attente progressive) sur les erreurs temporaires du fournisseur. */
export async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let last: Response | null = null
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status !== 429 && res.status < 500) return res
      last = res
    } catch (e) {
      if (i === attempts - 1) throw e
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)))
  }
  return last!
}
