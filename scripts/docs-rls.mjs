// Génère docs/architecture/rls.md à partir de la base réelle : RLS, politiques,
// droits accordés aux rôles anon / authenticated, stockage et fonctions
// exposées. Le document reflète donc toujours ce qui est réellement en place.
// Usage : npm run docs:rls
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const tables = await sql(`
  select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as force
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by c.relname`)
const policies = await sql(`
  select schemaname, tablename, policyname, cmd, roles::text as roles, qual, with_check
  from pg_policies where schemaname in ('public', 'storage') order by tablename, cmd, policyname`)
const grants = await sql(`
  select table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name, grantee order by table_name, grantee`)
const columnGrants = await sql(`
  select table_name, privilege_type, string_agg(column_name, ', ' order by column_name) as columns
  from information_schema.column_privileges
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('UPDATE', 'INSERT')
    and (table_name, privilege_type) not in (select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated')
  group by table_name, privilege_type order by table_name, privilege_type`)
const functions = await sql(`
  select p.proname as name, p.prosecdef as definer,
    has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' order by p.proname`)
const buckets = await sql(`select id, public, file_size_limit, allowed_mime_types::text as mimes from storage.buckets order by id`)

const esc = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const ROLE = { '{anon}': 'visiteur', '{authenticated}': 'connecté', '{anon,authenticated}': 'visiteur, connecté', '{public}': 'tous' }
const lines = [
  '# Règles de sécurité de la base (RLS)',
  '',
  `Document généré par \`npm run docs:rls\` le ${new Date().toISOString().slice(0, 10)} à partir de la base réelle — ne pas modifier à la main.`,
  '',
  'Principes : RLS activée sur toutes les tables, refus par défaut ; l’utilisateur ne voit que ses lignes (`user_id = auth.uid()`) ;',
  'les rôles d’équipe sont vérifiés par `app_private.has_role` ; les écritures sensibles (opérations extraites, abonnements, paiements,',
  'journaux) passent par les Edge Functions avec la clé de service, jamais par le navigateur.',
  '',
  '## Tables',
  '',
  '| Table | RLS | Droits visiteur | Droits connecté | Colonnes modifiables (connecté) |',
  '| --- | --- | --- | --- | --- |',
]
for (const t of tables) {
  const g = (role) => grants.find((x) => x.table_name === t.table && x.grantee === role)?.privileges ?? '—'
  const cols = columnGrants.filter((c) => c.table_name === t.table).map((c) => `${c.privilege_type} (${c.columns})`).join(' ; ') || '—'
  lines.push(`| \`${t.table}\` | ${t.rls ? '✓' : '✗ DÉSACTIVÉE'} | ${g('anon')} | ${g('authenticated')} | ${esc(cols)} |`)
}
lines.push('', '## Politiques', '')
let current = ''
for (const p of policies) {
  const name = `${p.schemaname}.${p.tablename}`
  if (name !== current) {
    current = name
    lines.push('', `### \`${name}\``, '', '| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |', '| --- | --- | --- | --- | --- |')
  }
  lines.push(`| ${p.policyname} | ${p.cmd} | ${ROLE[p.roles] ?? p.roles} | \`${esc(p.qual) || '—'}\` | \`${esc(p.with_check) || '—'}\` |`)
}
lines.push('', '## Stockage', '', '| Bucket | Public | Taille max | Types autorisés |', '| --- | --- | --- | --- |')
for (const b of buckets) lines.push(`| \`${b.id}\` | ${b.public ? 'oui' : 'non (privé)'} | ${b.file_size_limit ? `${Math.round(b.file_size_limit / 1024 / 1024)} Mo` : '—'} | ${b.mimes ?? '—'} |`)
lines.push('', '## Fonctions SQL exposées par l’API', '', '| Fonction | Privilèges du propriétaire | Visiteur | Connecté |', '| --- | --- | --- | --- |')
for (const f of functions) if (f.anon || f.auth) lines.push(`| \`${f.name}\` | ${f.definer ? 'oui (contrôles internes : rôle, fréquence)' : 'non'} | ${f.anon ? '✓' : '—'} | ${f.auth ? '✓' : '—'} |`)
lines.push('')
writeFileSync('docs/architecture/rls.md', lines.join('\n'))
const disabled = tables.filter((t) => !t.rls)
console.log(`docs/architecture/rls.md : ${tables.length} tables, ${policies.length} politiques${disabled.length ? ` — ⚠ RLS désactivée : ${disabled.map((t) => t.table).join(', ')}` : ', RLS active partout'}.`)
