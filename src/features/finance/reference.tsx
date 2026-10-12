// Référentiel métier chargé depuis la base : catégories, groupes, règles de
// catégorisation et seuils du diagnostic. Modifiables en base, sans
// redéploiement. En cas d'indisponibilité, le référentiel par défaut reste actif.
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LoadingState } from '@/components/feedback/states'
import { setCategoryRegistry, setThresholds, type Category, type CategoryKind, type ExpenseNature, type Thresholds } from '@/domain'
import { supabase } from '@/lib/supabase'
import { keys } from './api'

interface CategoryRow {
  code: string
  label: string
  kind: CategoryKind
  nature: ExpenseNature | null
  group_code: string
  is_debt: boolean
  is_essential: boolean
  icon: string
  sort_order: number
}

async function loadReference(): Promise<true> {
  const [categories, groups, rules, thresholds] = await Promise.all([
    supabase.from('categories').select('code, label, kind, nature, group_code, is_debt, is_essential, icon, sort_order').eq('is_active', true),
    supabase.from('category_groups').select('code, label, sort_order'),
    supabase.from('category_keyword_rules').select('pattern, category_code, priority'),
    supabase.from('diagnostic_rules').select('key, value'),
  ])
  const failed = [categories, groups, rules, thresholds].find((r) => r.error)
  if (failed) throw failed.error

  setCategoryRegistry(
    (categories.data as CategoryRow[]).map(
      (c): Category => ({
        code: c.code,
        label: c.label,
        kind: c.kind,
        nature: c.nature,
        groupCode: c.group_code,
        isDebt: c.is_debt,
        isEssential: c.is_essential,
        icon: c.icon,
        sortOrder: c.sort_order,
      }),
    ),
    groups.data!.map((g) => ({ code: g.code, label: g.label, sortOrder: g.sort_order })),
    rules.data!.map((r) => ({ pattern: r.pattern, categoryCode: r.category_code, priority: r.priority })),
  )
  setThresholds(Object.fromEntries(thresholds.data!.map((t) => [t.key, Number(t.value)])) as Partial<Record<keyof Thresholds, number>>)
  return true
}

/** Affiche ses enfants une fois le référentiel chargé (ou, à défaut, avec le référentiel par défaut). */
export function ReferenceGate({ children }: { children: ReactNode }) {
  const reference = useQuery({ queryKey: keys.reference, queryFn: loadReference, staleTime: 10 * 60_000, retry: 2 })
  if (reference.isLoading) return <LoadingState className="min-h-dvh" />
  return <>{children}</>
}
