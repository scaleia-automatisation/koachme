// @vitest-environment node
// Cohérence base de données ↔ API ↔ code : chaque table, colonne lue ou
// filtrée, fonction SQL et Edge Function appelée par l'application ou par les
// fonctions serveur existe réellement dans le projet Supabase.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { beforeAll, describe, expect, it } from 'vitest'

config({ path: '.env.local', quiet: true })

async function sql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return res.json()
}

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!['domain', 'node_modules', 'test'].includes(name)) files(full, out)
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const SOURCES = [...files('src'), ...files('supabase/functions')].map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))
const STORAGE_BUCKETS = new Set(['statements'])

let columns: Map<string, Set<string>>
let functions: Set<string>

beforeAll(async () => {
  const cols = await sql<{ table_name: string; column_name: string }>("select table_name, column_name from information_schema.columns where table_schema = 'public'")
  columns = new Map()
  for (const c of cols) columns.set(c.table_name, (columns.get(c.table_name) ?? new Set()).add(c.column_name))
  const fns = await sql<{ proname: string }>("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")
  functions = new Set(fns.map((f) => f.proname))
}, 30_000)

/** Chaînes `.from('table')…` : colonnes sélectionnées et filtrées jusqu'à la fin de l'instruction. */
function chains() {
  const found: { file: string; table: string; segment: string }[] = []
  for (const { file, text } of SOURCES) {
    for (const m of text.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
      const rest = text.slice(m.index! + m[0].length, m.index! + m[0].length + 700)
      const end = rest.search(/\n\s*\n|\n\s*(?:const|let|return|await|if|for)\b|\.from\(/)
      found.push({ file, table: m[1], segment: end === -1 ? rest : rest.slice(0, end) })
    }
  }
  return found
}

describe('cohérence base de données ↔ code', () => {
  it('chaque table utilisée existe', () => {
    const missing = chains()
      .filter((c) => !STORAGE_BUCKETS.has(c.table) && !columns.has(c.table))
      .map((c) => `${c.file} : ${c.table}`)
    expect(missing).toEqual([])
  })

  it('chaque colonne sélectionnée ou filtrée existe', () => {
    const missing: string[] = []
    for (const { file, table, segment } of chains()) {
      const known = columns.get(table)
      if (!known) continue
      const used = new Set<string>()
      const select = segment.match(/\.select\(\s*'([^']*)'/)
      if (select) {
        for (const part of select[1].split(',')) {
          const col = part.trim().split(':').pop()!.trim()
          if (col && col !== '*' && !col.includes('(')) used.add(col)
        }
      }
      for (const f of segment.matchAll(/\.(?:eq|neq|in|order|gte|lte|gt|lt|like|ilike|is|not)\(\s*'([a-z_]+)'/g)) used.add(f[1])
      for (const f of segment.matchAll(/onConflict:\s*'([a-z_,]+)'/g)) f[1].split(',').forEach((c) => used.add(c))
      for (const col of used) if (!known.has(col)) missing.push(`${file} : ${table}.${col}`)
    }
    expect(missing).toEqual([])
  })

  it('chaque fonction SQL appelée existe', () => {
    const missing: string[] = []
    for (const { file, text } of SOURCES) {
      for (const m of text.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)) if (!functions.has(m[1])) missing.push(`${file} : ${m[1]}`)
    }
    expect(missing).toEqual([])
  })

  it('chaque Edge Function appelée existe et est déclarée', () => {
    const config = readFileSync('supabase/config.toml', 'utf8')
    const missing: string[] = []
    for (const { file, text } of SOURCES) {
      for (const m of text.matchAll(/(?:functions\.invoke\(\s*'|\/functions\/v1\/)([a-z-]+)/g)) {
        const name = m[1]
        if (!existsSync(`supabase/functions/${name}/index.ts`) || !config.includes(`[functions.${name}]`)) missing.push(`${file} : ${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('toutes les migrations sont appliquées, sans modification après coup', async () => {
    const applied = await sql<{ version: string; checksum: string }>('select version, checksum from app_private.schema_migrations order by version')
    const local = readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => ({ version: f.replace(/.sql$/, ''), checksum: createHash('sha256').update(readFileSync(`supabase/migrations/${f}`, 'utf8')).digest('hex') }))
    expect(applied).toEqual(local)
  })
})
