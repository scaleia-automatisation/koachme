// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Tous les montants sont manipulés en centimes entiers pour éviter les
// erreurs d'arrondi des nombres flottants. La conversion vers les euros
// n'a lieu qu'à l'affichage.

export type Cents = number

export const CURRENCY = 'EUR'
export const LOCALE = 'fr-FR'

export function assertCents(value: number, label = 'Montant'): asserts value is Cents {
  if (!Number.isInteger(value)) throw new Error(`${label} invalide : ${value} n’est pas un nombre entier de centimes`)
}

/**
 * Convertit une saisie utilisateur en centimes.
 * Accepte « 1 234,56 », « 1234.56 », « 1 234 € » ou un nombre.
 * Retourne null si la saisie n'est pas un montant valide.
 */
export function parseEuros(input: string | number): Cents | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null
  }
  const normalized = input
    .replace(/[\s  €]/g, '')
    .replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
  return Math.round(Number(normalized) * 100)
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(decimals: boolean, signed: boolean): Intl.NumberFormat {
  const key = `${decimals}-${signed}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    formatters.set(key, f)
  }
  return f
}

/** Formate des centimes en euros : 123456 → « 1 234,56 € ». */
export function formatEuros(cents: Cents, opts: { decimals?: boolean; signed?: boolean } = {}): string {
  const decimals = opts.decimals ?? cents % 100 !== 0
  return formatter(decimals, opts.signed ?? false).format(cents / 100)
}

/** Formate un ratio (0.125 → « 12,5 % »). */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(ratio)
}
