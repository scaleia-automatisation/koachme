// Copie le moteur métier (src/domain) dans les Edge Functions, pour que le
// serveur calcule exactement les mêmes chiffres que l'interface.
// Les imports relatifs sont complétés par l'extension .ts (exigée par Deno).
// Lancé automatiquement avant chaque déploiement (npm run functions:deploy) ;
// le test tests/functions/domain-sync.test.ts vérifie que la copie est à jour.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SRC = 'src/domain'
const DEST = 'supabase/functions/_shared/domain'
const HEADER = '// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.\n'

export function transform(source) {
  return HEADER + source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g, (m, a, p, b) => (p.endsWith('.ts') ? m : `${a}${p}.ts${b}`))
}

export function domainFiles() {
  return readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
}

if (import.meta.url === `file:///${path.resolve(process.argv[1]).replace(/\\/g, '/')}` || process.argv[1]?.endsWith('sync-domain.mjs')) {
  rmSync(DEST, { recursive: true, force: true })
  mkdirSync(DEST, { recursive: true })
  for (const file of domainFiles()) writeFileSync(path.join(DEST, file), transform(readFileSync(path.join(SRC, file), 'utf8')))
  console.log(`Moteur synchronisé : ${domainFiles().length} fichiers → ${DEST}`)
}
