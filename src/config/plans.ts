// Les offres, prix et limites sont stockés en base (table plans) et modifiables
// depuis l'espace d'administration sans changer le code. Cette copie ne sert
// qu'en secours d'affichage si la base est momentanément injoignable ; elle ne
// donne jamais accès à une fonctionnalité.
import type { Plan } from '@/features/finance/billing'

export const FALLBACK_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Découverte',
    tagline: 'Pour faire un premier point sur votre budget',
    monthly_price_cents: 0,
    yearly_price_cents: null,
    highlighted: false,
    sort_order: 10,
    limits: { max_goals: 1, statement_imports_per_month: 1, coach_questions_per_month: 0, pdf_exports_per_month: 0, monthly_history: false, detailed_comparisons: false, advanced_recommendations: false },
    features: ['Saisie manuelle de votre budget', 'Premier bilan et statut de votre situation', 'Catégories de dépenses', '1 relevé analysé par mois', '1 objectif d’épargne', 'Recommandations essentielles'],
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Pour reprendre le contrôle mois après mois',
    monthly_price_cents: 599,
    yearly_price_cents: 5990,
    highlighted: true,
    sort_order: 20,
    limits: { max_goals: 20, statement_imports_per_month: 20, coach_questions_per_month: 100, pdf_exports_per_month: 10, monthly_history: true, detailed_comparisons: true, advanced_recommendations: true },
    features: ['Tout Découverte, plus :', 'Import et analyse avancée des relevés (20 par mois)', 'Historique mensuel et comparaisons détaillées', 'Coach IA (100 questions par mois)', 'Recommandations avancées', 'Objectifs et simulations (jusqu’à 20)', 'Export PDF des bilans (10 par mois)'],
  },
]

/** Délai de rétractation légal pour un abonnement souscrit en ligne (jours). */
export const WITHDRAWAL_DAYS = 14

/** Économie de l'offre annuelle, en mois offerts (arrondi). */
export function yearlyMonthsFree(plan: Plan): number {
  if (!plan.yearly_price_cents || !plan.monthly_price_cents) return 0
  return Math.round(12 - plan.yearly_price_cents / plan.monthly_price_cents)
}
