// Exécute une requête SQL (lue sur l'entrée standard) sur le projet distant.
// Réservé aux inspections ponctuelles ; les changements de schéma passent
// toujours par une migration (npm run db:migrate).
//
// Usage : echo "select 1" | npm run db:query --silent
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const ref = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !token) {
  console.error('SUPABASE_PROJECT_REF et SUPABASE_ACCESS_TOKEN doivent être définis dans .env.local')
  process.exit(1)
}

let query = ''
for await (const chunk of process.stdin) query += chunk
if (!query.trim()) {
  console.error('Aucune requête reçue sur l’entrée standard.')
  process.exit(1)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const body = await res.text()
if (!res.ok) {
  console.error(`SQL refusé (${res.status}) : ${body}`)
  process.exit(1)
}
console.log(JSON.stringify(JSON.parse(body || '[]'), null, 2))
