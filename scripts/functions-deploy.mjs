// Déploie toutes les Edge Functions sur le projet Supabase (.env.local).
import { spawnSync } from 'node:child_process'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })
const ref = process.env.SUPABASE_PROJECT_REF
if (!ref || !process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_PROJECT_REF et SUPABASE_ACCESS_TOKEN doivent être définis dans .env.local')
  process.exit(1)
}
spawnSync('node', ['scripts/sync-domain.mjs'], { stdio: 'inherit' })
const r = spawnSync('npx', ['--yes', 'supabase@2.120.0', 'functions', 'deploy', '--project-ref', ref, '--use-api'], { stdio: 'inherit', shell: true, env: process.env })
process.exit(r.status ?? 1)
