// Étapes du parcours de saisie guidée (parcours B).
import type { CategoryCode } from '@/domain'

export type StepId = 'revenus' | 'charges' | 'depenses' | 'situation'

export interface Step {
  id: StepId
  title: string
  intro: string
  /** Catégories proposées d'emblée (lignes vides). */
  suggested: CategoryCode[]
  /** Catégories disponibles pour une ligne ajoutée. */
  available: CategoryCode[]
}

export const STEPS: Step[] = [
  {
    id: 'revenus',
    title: 'Mes revenus',
    intro: 'Ce qui entre chaque mois. Indiquez des montants nets, tels qu’ils arrivent sur votre compte.',
    suggested: ['salaire', 'revenus_independants', 'aides_allocations', 'pensions_retraites', 'revenus_locatifs', 'autres_revenus'],
    available: ['salaire', 'revenus_independants', 'aides_allocations', 'pensions_retraites', 'revenus_locatifs', 'autres_revenus'],
  },
  {
    id: 'charges',
    title: 'Mes charges fixes',
    intro: 'Les dépenses qui reviennent chaque mois et que vous ne pouvez pas modifier facilement.',
    suggested: ['logement', 'energie_eau', 'telecom', 'assurances', 'abonnements', 'credits_consommation', 'autres_charges'],
    available: ['logement', 'credit_immobilier', 'energie_eau', 'telecom', 'assurances', 'abonnements', 'credits_consommation', 'impots_taxes', 'scolarite_garde', 'autres_charges', 'epargne'],
  },
  {
    id: 'depenses',
    title: 'Mes dépenses courantes',
    intro: 'Une estimation suffit : vous pourrez l’affiner plus tard avec un relevé bancaire.',
    suggested: ['alimentation', 'transport', 'sante', 'restaurants_livraisons', 'loisirs_sorties', 'shopping', 'enfants', 'autres_depenses'],
    available: ['alimentation', 'transport', 'sante', 'restaurants_livraisons', 'loisirs_sorties', 'shopping', 'enfants', 'cadeaux_dons', 'frais_bancaires', 'autres_depenses'],
  },
  {
    id: 'situation',
    title: 'Ma situation',
    intro: 'Quelques précisions pour personnaliser votre diagnostic. Toutes les questions sont facultatives.',
    suggested: [],
    available: [],
  },
]
