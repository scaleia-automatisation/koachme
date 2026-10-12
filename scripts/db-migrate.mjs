// Applique les migrations SQL de supabase/migrations sur le projet distant
// via l'API Management de Supabase. Chaque migration est exécutée dans une
// transaction et enregistrée dans app_private.schema_migrations.
//
// Usage : npm run db:migrate            → applique les migrations en attente
//         npm run db:migrate -- --status → liste l'état sans rien appliquer
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const ref = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !token) {
  console.error('SUPABASE_PROJECT_REF et SUPABASE_ACCESS_TOKEN doivent être définis dans .env.local')
  process.exit(1)
}

export async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`SQL refusé (${res.status}) : ${body}`)
  return body ? JSON.parse(body) : []
}

const dir = path.resolve('supabase/migrations')
const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()

await runSql(`
  create schema if not exists app_private;
  revoke all on schema app_private from public, anon, authenticated;
  create table if not exists app_private.schema_migrations (
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
`)

const applied = new Map(
  (await runSql('select version, checksum from app_private.schema_migrations')).map((r) => [r.version, r.checksum]),
)
const statusOnly = process.argv.includes('--status')
let count = 0

for (const file of files) {
  const sql = readFileSync(path.join(dir, file), 'utf8')
  const checksum = createHash('sha256').update(sql).digest('hex')
  const version = file.replace(/\.sql$/, '')

  if (applied.has(version)) {
    if (applied.get(version) !== checksum) {
      console.error(`✗ ${file} a été modifiée après application. Créez une nouvelle migration.`)
      process.exit(1)
    }
    console.log(`✓ ${file} (déjà appliquée)`)
    continue
  }
  if (statusOnly) {
    console.log(`… ${file} (en attente)`)
    continue
  }

  await runSql(`begin;
${sql}
insert into app_private.schema_migrations (version, checksum) values ('${version}', '${checksum}');
commit;`)
  console.log(`+ ${file} appliquée`)
  count++
}

if (!statusOnly) console.log(count ? `${count} migration(s) appliquée(s).` : 'Base à jour.')
