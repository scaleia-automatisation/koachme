import { assertCents, type Cents } from './money'

/** once : montant ponctuel, lissé sur 12 mois dans le budget mensuel. */
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once'

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Par semaine',
  monthly: 'Par mois',
  quarterly: 'Par trimestre',
  yearly: 'Par an',
  once: 'Ponctuel',
}

/** Nombre d'occurrences par an. */
const PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  once: 1,
}

/** Ramène un montant à son équivalent mensuel, arrondi au centime. */
export function toMonthly(amount: Cents, frequency: Frequency): Cents {
  assertCents(amount)
  return Math.round((amount * PER_YEAR[frequency]) / 12)
}
