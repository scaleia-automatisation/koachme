// Outils des tests d'intégration : création et suppression de comptes de test
// sur le projet Supabase distant (clé secrète utilisée uniquement ici).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const url = process.env.VITE_SUPABASE_URL!
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!
const secretKey = process.env.SUPABASE_SECRET_KEY!

export const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

export function anonClient(): SupabaseClient {
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface TestUser {
  id: string
  email: string
  password: string
  client: SupabaseClient
}

export const TERMS_VERSION = '2026-10-12'

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `economiz-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
  const password = `Test-${Math.random().toString(36).slice(2)}9A`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { terms_version: TERMS_VERSION, display_name: `Test ${label}` },
  })
  if (error || !data.user) throw error ?? new Error('Création du compte de test impossible')
  const client = anonClient()
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, email, password, client }
}

/** Simule un abonnement Premium actif (écrit côté serveur, comme le ferait le webhook). */
export async function makePremium(user: TestUser) {
  const { error } = await admin.from('subscriptions').insert({
    user_id: user.id,
    stripe_subscription_id: `sub_test_${user.id.slice(0, 8)}_${Date.now()}`,
    plan_id: 'premium',
    status: 'active',
    billing_interval: 'month',
    current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
  })
  if (error) throw error
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return
  const { data } = await admin.storage.from('statements').list(user.id)
  if (data?.length) await admin.storage.from('statements').remove(data.map((f) => `${user.id}/${f.name}`))
  await admin.auth.admin.deleteUser(user.id)
}
