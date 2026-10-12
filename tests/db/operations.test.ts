// @vitest-environment node
// Limites d'offre côté serveur, export PDF, maintenance planifiée, anti-abus.
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createTestUser, deleteTestUser, makePremium, type TestUser } from '../helpers'

config({ path: '.env.local', quiet: true })
let free: TestUser
let premium: TestUser

beforeAll(async () => {
  ;[free, premium] = await Promise.all([createTestUser('ops-free'), createTestUser('ops-premium')])
  await makePremium(premium)
  for (const u of [free, premium]) {
    await u.client.from('monthly_reports').upsert({
      period: '2026-09',
      snapshot: {
        version: 1, period: '2026-09', generatedAt: '2026-09-30T10:00:00Z', status: 'vigilance', headline: 'Épargne inférieure à l’objectif', completenessScore: 80,
        income: 250000, expenses: 180000, savings: 10000, balance: 60000, savingsRate: 0.04, fees: 600, potentialMonthly: 3000, confirmedSavingsMonthly: 0,
        debtRepayments: 15000, debtRemaining: null, byGroup: [{ code: 'logement', label: 'Logement', amount: 90000 }], goals: [], keyPoints: ['Vos revenus couvrent vos dépenses.'],
        priorities: ['Programmer une épargne automatique'], sources: { income: 'declared', expenses: 'declared', statementPeriod: null },
      },
    })
  }
}, 40_000)

afterAll(async () => {
  await Promise.all([free, premium].map(deleteTestUser))
}, 40_000)

describe('export PDF du bilan mensuel', () => {
  it('réservé à l’offre Premium', async () => {
    const r = await free.client.functions.invoke('report-pdf', { body: { period: '2026-09' } })
    expect(r.error).not.toBeNull()
    expect(await (r.error as { context: Response }).context.json()).toMatchObject({ error: { code: 'plan_limit_exports' } })
  })

  it('génère un vrai PDF pour un abonné', async () => {
    const { data: session } = await premium.client.auth.getSession()
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/report-pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.session!.access_token}`, apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: '2026-09' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1500)
    const { data: logs } = await premium.client.from('audit_logs').select('action')
    expect(logs!.map((l) => l.action)).toContain('data.report_exported')
  }, 30_000)

  it('quota mensuel consommé de façon atomique', async () => {
    const results = []
    for (let i = 0; i < 3; i++) results.push((await admin.rpc('usage_try', { p_user: free.id, p_metric: 'test_metric', p_max: 2 })).data)
    expect(results).toEqual([true, true, false])
  })
})

describe('limite d’import de l’offre gratuite', () => {
  it('un deuxième relevé dans le mois est refusé et n’est pas conservé', async () => {
    const bytes = readFileSync('tests/fixtures/releve-test.pdf')
    const upload = async (name: string) => {
      const path = `${free.id}/${crypto.randomUUID()}.pdf`
      await free.client.storage.from('statements').upload(path, new Blob([bytes], { type: 'application/pdf' }))
      const { data } = await free.client.from('statement_imports').insert({ file_path: path, file_name: name, file_size: bytes.length }).select().single()
      return { id: data.id as string, path }
    }
    const first = await upload('premier.pdf')
    expect((await free.client.functions.invoke('process-statement', { body: { importId: first.id } })).error).toBeNull()
    const second = await upload('second.pdf')
    const r = await free.client.functions.invoke('process-statement', { body: { importId: second.id } })
    expect(await (r.error as { context: Response }).context.json()).toMatchObject({ error: { code: 'plan_limit_imports' } })
    expect((await free.client.from('statement_imports').select('id').eq('id', second.id)).data).toEqual([])
    expect((await admin.storage.from('statements').list(free.id)).data!.map((f) => `${free.id}/${f.name}`)).not.toContain(second.path)
  }, 60_000)
})

describe('maintenance planifiée', () => {
  const call = (secret?: string) =>
    fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-maintenance-secret': secret } : {}) },
      body: '{}',
    })

  it('refuse tout appel sans le secret', async () => {
    expect((await call()).status).toBe(403)
    expect((await call('mauvais-secret')).status).toBe(403)
  })

  it('reprend les imports bloqués et applique la durée de conservation du coach', async () => {
    const old = new Date(Date.now() - 3600_000).toISOString()
    const { data: stuck } = await admin.from('statement_imports').insert({ user_id: premium.id, file_path: `${premium.id}/bloque.pdf`, file_name: 'bloque.pdf', file_size: 10, status: 'processing', updated_at: old }).select('id').single()
    await premium.client.from('profiles').update({ coach_retention_days: 30 }).eq('id', premium.id)
    const { data: conv } = await admin.from('coach_conversations').insert({ user_id: premium.id, title: 'Ancienne', updated_at: new Date(Date.now() - 40 * 86400_000).toISOString() }).select('id').single()
    const { data: recent } = await admin.from('coach_conversations').insert({ user_id: premium.id, title: 'Récente' }).select('id').single()

    const res = await call(process.env.MAINTENANCE_SECRET)
    expect(res.status).toBe(200)
    const summary = await res.json()
    expect(summary.stuck_imports_reset).toBeGreaterThanOrEqual(1)
    expect(summary.coach_conversations_purged).toBeGreaterThanOrEqual(1)

    expect((await admin.from('statement_imports').select('status, error_code').eq('id', stuck!.id).single()).data).toEqual({ status: 'failed', error_code: 'processing_error' })
    expect((await admin.from('coach_conversations').select('id').eq('id', conv!.id)).data).toEqual([])
    expect((await admin.from('coach_conversations').select('id').eq('id', recent!.id)).data).toHaveLength(1)
  }, 60_000)

  it('la tâche quotidienne est planifiée', async () => {
    const { data } = await admin.rpc('run_maintenance')
    expect(data).toHaveProperty('stuck_imports_reset')
  })
})

describe('anti-abus', () => {
  it('limite le formulaire de contact à 5 messages par heure et par adresse', async () => {
    const anon = anonClient()
    const email = `abus-${Date.now()}@example.com`
    const results = []
    for (let i = 0; i < 6; i++) results.push((await anon.from('contact_messages').insert({ name: 'Test', email, topic: 'question', message: `Message de test numéro ${i}.` })).error === null)
    expect(results).toEqual([true, true, true, true, true, false])
    await admin.from('contact_messages').delete().eq('email', email)
  })

  it('n’expose pas les tables internes (consommation IA, limites, événements Stripe)', async () => {
    for (const table of ['ai_usage', 'rate_limits', 'stripe_events', 'usage_counters']) {
      expect((await premium.client.schema('app_private').from(table).select('*')).error).not.toBeNull()
    }
    expect((await premium.client.rpc('run_maintenance')).error).not.toBeNull()
    expect((await premium.client.rpc('usage_try', { p_user: premium.id, p_metric: 'x', p_max: null })).error).not.toBeNull()
  })
})

describe('erreurs du navigateur et surveillance', () => {
  it('enregistre une erreur du navigateur en masquant les données sensibles', async () => {
    const marker = `TestErreur${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8)}`
    expect((await anonClient().rpc('log_client_error', { p_code: 'window_error', p_message: `${marker}: jean@exemple.fr FR7630004000500060007000123 montant 1 234,56`, p_path: '/app/releves/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0' })).error).toBeNull()
    const { data } = await admin.from('app_logs').select('source, code, message, context').like('message', `${marker}%`).single()
    expect(data).toMatchObject({ source: 'frontend', code: 'window_error', context: { path: '/app/releves/:id', authenticated: false } })
    expect(data!.message).not.toMatch(/jean@|FR76|1 234/)
    await admin.from('app_logs').delete().like('message', `${marker}%`)
  })

  it('les indicateurs de surveillance sont réservés au serveur', async () => {
    expect((await free.client.rpc('monitoring_snapshot', { p_minutes: 15 })).error).not.toBeNull()
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-maintenance-secret': process.env.MAINTENANCE_SECRET! },
      body: JSON.stringify({ mode: 'surveillance' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ errors: expect.any(Number), webhook_errors: expect.any(Number), failed_imports: expect.any(Number) })
  })

  it('la surveillance est planifiée toutes les 15 minutes', async () => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "select schedule from cron.job where jobname = 'economiz-surveillance'" }),
    })
    expect(await res.json()).toEqual([{ schedule: '*/15 * * * *' }])
  })
})
