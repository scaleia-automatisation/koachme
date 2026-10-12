// Test de restauration de la dernière sauvegarde (ou de celle indiquée).
//
// 1. Déchiffre la sauvegarde et vérifie l'empreinte de chaque table et fichier.
// 2. Restaure réellement les données dans un schéma temporaire « restore_test »
//    de la base (structure identique aux tables de production).
// 3. Compare les nombres de lignes restaurées au manifeste.
// 4. Supprime le schéma temporaire.
//
// Usage : npm run restore:test [-- backups/AAAA-MM-JJTHH-MM-SS]
import { createDecipheriv, createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const KEY = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? '', 'hex')
if (KEY.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY manquante ou invalide')

function decrypt(buf) {
  if (buf.subarray(0, 4).toString() !== 'ECZ1') throw new Error('Format de sauvegarde inconnu')
  const iv = buf.subarray(4, 16)
  const tag = buf.subarray(16, 32)
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(buf.subarray(32)), decipher.final()])
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

const dir = process.argv[2] ?? path.join('backups', readdirSync('backups').sort().at(-1))
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
const data = JSON.parse(decrypt(readFileSync(path.join(dir, 'data.json.enc'))).toString())
console.log(`Sauvegarde ${dir} du ${manifest.created_at}`)

// 1. Intégrité
for (const [table, meta] of Object.entries(manifest.tables)) {
  if (sha256(JSON.stringify(data[table])) !== meta.sha256) throw new Error(`Empreinte invalide pour ${table}`)
}
for (const f of manifest.files) {
  if (sha256(decrypt(readFileSync(path.join(dir, 'files', f.name)))) !== f.sha256) throw new Error(`Fichier corrompu : ${f.name}`)
}
if (data.__auth_users.length !== manifest.users) throw new Error('Nombre de comptes incohérent')
console.log(`✓ Intégrité : ${Object.keys(manifest.tables).length} tables, ${manifest.files.length} fichiers, ${manifest.users} comptes`)

// 2-3. Restauration dans un schéma temporaire
const tag = `r${Date.now()}`
await sql('drop schema if exists restore_test cascade; create schema restore_test;')
let restored = 0
try {
  for (const [table, rows] of Object.entries(data)) {
    if (table === '__auth_users') continue
    await sql(`create table restore_test.${table} (like public.${table} including defaults);`)
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = JSON.stringify(rows.slice(i, i + 500))
      await sql(`insert into restore_test.${table} select * from json_populate_recordset(null::restore_test.${table}, $${tag}$${chunk}$${tag}$::json);`)
    }
    const [{ n }] = await sql(`select count(*)::int as n from restore_test.${table}`)
    if (n !== manifest.tables[table].count) throw new Error(`Restauration incomplète de ${table} : ${n}/${manifest.tables[table].count}`)
    restored += n
  }
  console.log(`✓ Restauration : ${restored} lignes restaurées et vérifiées dans un schéma temporaire`)
} finally {
  // 4. Nettoyage
  await sql('drop schema if exists restore_test cascade;')
}
console.log('✓ Test de restauration réussi')
