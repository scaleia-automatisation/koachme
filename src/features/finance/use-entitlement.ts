// Droits de l'offre, tels que renvoyés par le serveur (undefined tant qu'il n'a pas répondu).
import { useEntitlements, type PlanLimits } from './billing'

export type BooleanFeature = 'monthly_history' | 'detailed_comparisons' | 'advanced_recommendations'
type NumericLimit = 'max_goals' | 'statement_imports_per_month' | 'coach_questions_per_month' | 'pdf_exports_per_month'

export function useFeature(feature: BooleanFeature): boolean | undefined {
  const ent = useEntitlements()
  return ent.data ? Boolean(ent.data.limits[feature]) : undefined
}

export function useLimit(limit: NumericLimit): PlanLimits[NumericLimit] | undefined {
  const ent = useEntitlements()
  return ent.data ? ent.data.limits[limit] : undefined
}

export function useIsPremium(): boolean | undefined {
  const ent = useEntitlements()
  return ent.data ? ent.data.plan !== 'free' : undefined
}
