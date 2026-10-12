// Contrôle de cohérence d'un relevé : solde initial + opérations comptabilisées
// = solde final. Utilisé par le serveur (process-statement) pour décider si un
// relevé peut entrer dans le bilan sans vérification de l'utilisateur.
import type { Cents } from './money'

export type BalanceCheck = 'ok' | 'mismatch' | 'unknown'

/** Écart toléré (centimes) : arrondis de lecture du document. */
export const BALANCE_TOLERANCE = 1

export function checkStatementBalance(
  opening: Cents | null,
  closing: Cents | null,
  operations: readonly { amount: Cents; isPending: boolean }[],
): { gap: Cents | null; check: BalanceCheck } {
  if (opening === null || closing === null) return { gap: null, check: 'unknown' }
  // Les opérations en attente ne sont pas encore dans le solde de la banque.
  const settled = operations.filter((o) => !o.isPending).reduce((s, o) => s + o.amount, 0)
  const gap = closing - (opening + settled)
  return { gap, check: Math.abs(gap) <= BALANCE_TOLERANCE ? 'ok' : 'mismatch' }
}
