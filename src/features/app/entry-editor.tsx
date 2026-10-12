// Éditeur des lignes d'une étape du budget : ajout, modification et
// suppression de lignes, enregistrées en une fois.
import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Button } from '@/components/ui/button'
import { FREQUENCY_LABELS, formatEuros, getCategory, parseEuros, toMonthly, type CategoryCode, type EntrySource, type Frequency } from '@/domain'
import { nextKey, rowError, type Row } from './entry-rows'
import { cn } from '@/lib/utils'

interface EntryEditorProps {
  rows: Row[]
  onChange: (rows: Row[]) => void
  categories: readonly CategoryCode[]
  defaultSource: EntrySource
  /** Affiche la case « absent de mes relevés » (si l'utilisateur a importé des relevés). */
  offStatementToggle: boolean
  replacedIds: ReadonlySet<string>
  showErrors: boolean
}

export function EntryEditor({ rows, onChange, categories, defaultSource, offStatementToggle, replacedIds, showErrors }: EntryEditorProps) {
  const update = (key: string, patch: Partial<Row>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key))
  const add = () =>
    onChange([...rows, { key: nextKey(), categoryCode: categories[categories.length - 1], label: '', amountText: '', frequency: 'monthly', source: defaultSource, custom: true }])

  const monthlyTotal = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const c = parseEuros(r.amountText)
        return c && c > 0 ? sum + toMonthly(c, r.frequency) : sum
      }, 0),
    [rows],
  )

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((row) => {
          const category = getCategory(row.categoryCode)
          const error = showErrors || row.amountText ? rowError(row) : null
          const amountId = `montant-${row.key}`
          return (
            <li key={row.key} className={cn('rounded-xl border bg-surface p-4', error ? 'border-danger/50' : 'border-border')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {row.custom ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select aria-label="Catégorie" value={row.categoryCode} onChange={(e) => update(row.key, { categoryCode: e.target.value as CategoryCode })}>
                        {categories.map((code) => (
                          <option key={code} value={code}>
                            {getCategory(code).label}
                          </option>
                        ))}
                      </Select>
                      <Input aria-label="Précision (facultatif)" placeholder="Précision (facultatif)" maxLength={80} value={row.label} onChange={(e) => update(row.key, { label: e.target.value })} />
                    </div>
                  ) : (
                    <label htmlFor={amountId} className="font-medium">
                      {category.label}
                    </label>
                  )}
                  {row.id && replacedIds.has(row.id) && (
                    <Badge tone="warning" className="mt-2">
                      Remplacé par vos relevés : non compté
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-9 text-muted-foreground hover:text-danger" onClick={() => remove(row.key)} aria-label={`Supprimer la ligne ${category.label}`}>
                  <Trash2 />
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,11rem)]">
                <div className="relative">
                  <Input
                    id={amountId}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={row.custom ? 'Montant' : undefined}
                    aria-invalid={error ? true : undefined}
                    className="tabular pr-8"
                    value={row.amountText}
                    onChange={(e) => update(row.key, { amountText: e.target.value })}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">€</span>
                </div>
                <Select aria-label="Fréquence" value={row.frequency} onChange={(e) => update(row.key, { frequency: e.target.value as Frequency })}>
                  {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </div>
              {error && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                  {error}
                </p>
              )}
              {row.frequency === 'once' && <p className="mt-1.5 text-xs text-muted-foreground">Montant ponctuel : réparti sur 12 mois dans votre bilan.</p>}
              {offStatementToggle && category.kind === 'income' && (
                <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={row.source === 'off_statement'} onChange={(e) => update(row.key, { source: e.target.checked ? 'off_statement' : 'manual' })} />
                  Ce revenu n’apparaît pas sur mes relevés
                </label>
              )}
            </li>
          )
        })}
      </ul>

      <Button variant="outline" onClick={add} className="w-full border-dashed">
        <Plus aria-hidden />
        Ajouter une ligne
      </Button>

      <p className="flex justify-between rounded-lg bg-muted px-4 py-3 text-sm">
        <span className="text-muted-foreground">Total mensuel de cette étape</span>
        <span className="tabular font-semibold">{formatEuros(monthlyTotal)}</span>
      </p>
    </div>
  )
}

