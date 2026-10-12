// Lignes de l’éditeur de budget : initialisation, validation et calcul des changements.
import { getCategory, parseEuros, type CategoryCode, type DeclaredEntry, type EntrySource, type Frequency } from '@/domain'
import type { EntryDraft } from '@/features/finance/api'

export interface Row {
  key: string
  id?: string
  categoryCode: CategoryCode
  label: string
  amountText: string
  frequency: Frequency
  source: EntrySource
  /** Ligne ajoutée par l'utilisateur (catégorie et précision modifiables). */
  custom: boolean
}

let keySeq = 0
export const nextKey = () => `r${++keySeq}`

const centsToText = (cents: number) => (cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ /g, ' ')

/** Lignes initiales : lignes existantes, puis une ligne vide par catégorie suggérée non encore renseignée. */
export function initialRows(existing: readonly DeclaredEntry[], suggested: readonly CategoryCode[], defaultSource: EntrySource): Row[] {
  const rows: Row[] = existing.map((e) => ({
    key: nextKey(),
    id: e.id,
    categoryCode: e.categoryCode,
    label: e.label ?? '',
    amountText: centsToText(e.amount),
    frequency: e.frequency,
    source: e.source,
    custom: !suggested.includes(e.categoryCode) || existing.filter((x) => x.categoryCode === e.categoryCode).indexOf(e) > 0,
  }))
  for (const code of suggested) {
    if (!existing.some((e) => e.categoryCode === code)) {
      rows.push({ key: nextKey(), categoryCode: code, label: '', amountText: '', frequency: 'monthly', source: defaultSource, custom: false })
    }
  }
  return rows.sort((a, b) => getCategory(a.categoryCode).sortOrder - getCategory(b.categoryCode).sortOrder)
}

export function rowError(row: Row): string | null {
  if (!row.amountText.trim()) return null
  const cents = parseEuros(row.amountText)
  if (cents === null) return 'Montant invalide'
  if (cents < 0) return 'Le montant doit être positif'
  if (cents > 10_000_000_00) return 'Montant trop élevé'
  return null
}

/** Calcule les changements à enregistrer par rapport aux lignes existantes. */
export function diffRows(rows: readonly Row[], existing: readonly DeclaredEntry[]): { upserts: EntryDraft[]; deletions: string[] } {
  const upserts: EntryDraft[] = []
  const kept = new Set<string>()
  for (const row of rows) {
    const cents = parseEuros(row.amountText)
    if (cents === null || cents <= 0) continue
    if (row.id) kept.add(row.id)
    const prev = existing.find((e) => e.id === row.id)
    const draft: EntryDraft = { id: row.id, categoryCode: row.categoryCode, label: row.label.trim() || null, amount: cents, frequency: row.frequency, source: row.source }
    const changed =
      !prev || prev.amount !== cents || prev.frequency !== row.frequency || prev.categoryCode !== row.categoryCode || (prev.label ?? '') !== row.label.trim() || prev.source !== row.source
    if (changed) upserts.push(draft)
  }
  const deletions = existing.filter((e) => !kept.has(e.id)).map((e) => e.id)
  return { upserts, deletions }
}

