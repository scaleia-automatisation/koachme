// @vitest-environment node
// Référentiels en base (catégories, groupes, règles, seuils) : lisibles par
// tous, non modifiables côté client, cohérents avec le référentiel par défaut.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, DEFAULT_GROUPS, DEFAULT_KEYWORD_RULES } from '@/domain/categories'
import { DEFAULT_THRESHOLDS } from '@/domain/status'

config({ path: '.env.local', quiet: true })

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
})

describe('référentiels publics', () => {
  it('contiennent toutes les catégories par défaut, à l’identique', async () => {
    const { data, error } = await supabase.from('categories').select('code, label, kind, nature, is_debt, is_essential, group_code, icon, sort_order, is_active')
    expect(error).toBeNull()
    const byCode = new Map(data!.map((c) => [c.code, c]))
    for (const c of DEFAULT_CATEGORIES) {
      expect(byCode.get(c.code)).toEqual({
        code: c.code,
        label: c.label,
        kind: c.kind,
        nature: c.nature,
        is_debt: c.isDebt,
        is_essential: c.isEssential,
        group_code: c.groupCode,
        icon: c.icon,
        sort_order: c.sortOrder,
        is_active: true,
      })
    }
  })

  it('contiennent les groupes, les règles et les seuils', async () => {
    const groups = await supabase.from('category_groups').select('code')
    expect(groups.data!.map((g) => g.code).sort()).toEqual(DEFAULT_GROUPS.map((g) => g.code).sort())
    const rules = await supabase.from('category_keyword_rules').select('pattern, category_code, priority').order('priority')
    expect(rules.data).toHaveLength(DEFAULT_KEYWORD_RULES.length)
    for (const r of rules.data!) expect(() => new RegExp(r.pattern)).not.toThrow()
    const th = await supabase.from('diagnostic_rules').select('key, value')
    expect(Object.fromEntries(th.data!.map((x) => [x.key, Number(x.value)]))).toEqual(DEFAULT_THRESHOLDS)
  })

  it('refusent toute écriture côté client', async () => {
    expect((await supabase.from('categories').insert({ code: 'pirate', label: 'x', kind: 'expense', nature: 'fixed', icon: 'x', sort_order: 1, group_code: 'autres' })).error).not.toBeNull()
    expect((await supabase.from('category_keyword_rules').insert({ pattern: 'X', category_code: 'salaire', priority: 0 })).error).not.toBeNull()
    expect((await supabase.from('diagnostic_rules').update({ value: 99 }).eq('key', 'debtRatioMax').select()).data ?? []).toEqual([])
    const { data } = await supabase.from('categories').select('label').eq('code', 'salaire').single()
    expect(data?.label).toBe('Salaires')
  })

  it('n’exposent pas le schéma privé', async () => {
    const { error } = await supabase.schema('app_private').from('schema_migrations').select('*')
    expect(error).not.toBeNull()
  })
})
