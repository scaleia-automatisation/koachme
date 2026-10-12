// Sauvegarde chiffrée des données Economiz.
//
// Contenu : toutes les tables du schéma public, les comptes (identifiants,
// emails, métadonnées — jamais les mots de passe), et les fichiers de relevés.
// Le schéma lui-même est versionné dans supabase/migrations.
//
// Chiffrement AES-256-GCM avec BACKUP_ENCRYPTION_KEY (.env.local, 64 caractères
// hexadécimaux) : sans cette clé, la sauvegarde est inexploitable. Conservez la
// clé séparément des sauvegardes (gestionnaire de mots de passe de l'entreprise).
//
// Usage : npm run backup          → backups/AAAA-MM-JJTHH-MM-SS/
// Conservation : 30 jours glissants (BACKUP_RETENTION_DAYS) ; les plus anciennes sont supprimées.
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

let key = process.env.BACKUP_ENCRYPTION_KEY
if (!key) {
  key = randomBytes(32).toString('hex')
  appendFileSync('.env.local', `\n# Clé de chiffrement des sauvegardes : à conserver séparément, sans elle aucune restauration n'est possible\nBACKUP_ENCRYPTION_KEY=${key}\n`)
  console.log('Nouvelle clé de chiffrement créée dans .env.local (BACKUP_ENCRYPTION_KEY) : sauvegardez-la en lieu sûr.')
}
const KEY = Buffer.from(key, 'hex')
if (KEY.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY doit faire 64 caractères hexadécimaux')

export function encrypt(buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(buffer), cipher.final()])
  return Buffer.concat([Buffer.from('ECZ1'), iv, cipher.getAuthTag(), body])
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`SQL refusé : ${await res.text()}`)
  return res.json()
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = path.join('backups', stamp)
mkdirSync(path.join(dir, 'files'), { recursive: true })

const tables = (await sql(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)).map((r) => r.table_name)
const data = {}
const manifest = { format: 'economiz-backup-v1', created_at: new Date().toISOString(), tables: {}, users: 0, files: [] }

for (const table of tables) {
  // Export par la Management API (lecture SQL directe, indépendante des politiques RLS).
  const rows = await sql(`select coalesce(json_agg(t), '[]') as rows from public.${table} t`)
  data[table] = rows[0].rows
  manifest.tables[table] = { count: data[table].length, sha256: sha256(JSON.stringify(data[table])) }
}

const users = []
for (let page = 1; ; page++) {
  const { data: list, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  users.push(...list.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, email_confirmed_at: u.email_confirmed_at, user_metadata: u.user_metadata })))
  if (list.users.length < 1000) break
}
data.__auth_users = users
manifest.users = users.length

writeFileSync(path.join(dir, 'data.json.enc'), encrypt(Buffer.from(JSON.stringify(data))))

// Fichiers de relevés (stockage privé), chiffrés un par un.
for (const imp of data.statement_imports ?? []) {
  const { data: blob, error } = await db.storage.from('statements').download(imp.file_path)
  if (error || !blob) continue
  const buf = Buffer.from(await blob.arrayBuffer())
  const name = `${sha256(imp.file_path)}.enc`
  writeFileSync(path.join(dir, 'files', name), encrypt(buf))
  manifest.files.push({ path: imp.file_path, name, sha256: sha256(buf), size: buf.length })
}

writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
const total = Object.values(manifest.tables).reduce((s, t) => s + t.count, 0)
console.log(`Sauvegarde ${dir} : ${tables.length} tables, ${total} lignes, ${users.length} comptes, ${manifest.files.length} fichiers (chiffrés).`)

// Conservation : suppression des sauvegardes locales de plus de 30 jours.
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30)
for (const name of readdirSync('backups')) {
  const full = path.join('backups', name)
  if (name !== stamp && statSync(full).isDirectory() && Date.now() - statSync(full).mtimeMs > retentionDays * 86_400_000) {
    rmSync(full, { recursive: true, force: true })
    console.log(`Sauvegarde expirée supprimée : ${name}`)
  }
}
