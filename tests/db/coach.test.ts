// @vitest-environment node
// Coach IA contre le projet distant (appels réels au modèle).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, createTestUser, deleteTestUser, makePremium, type TestUser } from '../helpers'

const ROUTES = /^\/app(\/|$|\?|#)/
let user: TestUser
let other: TestUser
let conversationId: string

beforeAll(async () => {
  ;[user, other] = await Promise.all([createTestUser('coach'), createTestUser('coach-intrus')])
  await makePremium(user)
  const entries = [
    { category_code: 'salaire', amount_cents: 250000 },
    { category_code: 'logement', amount_cents: 85000 },
    { category_code: 'alimentation', amount_cents: 42000 },
    { category_code: 'abonnements', amount_cents: 6500 },
    { category_code: 'restaurants_livraisons', amount_cents: 22000 },
    { category_code: 'credits_consommation', amount_cents: 18000 },
  ]
  expect((await user.client.from('budget_entries').insert(entries)).error).toBeNull()
  expect((await user.client.from('profiles').update({ onboarding_path: 'manual' }).eq('id', user.id)).error).toBeNull()
}, 30_000)

afterAll(async () => {
  await Promise.all([deleteTestUser(user), deleteTestUser(other)])
}, 30_000)

async function ask(client: TestUser['client'], message: string, convId: string | null = null) {
  return client.functions.invoke('coach', { body: { conversationId: convId, message } })
}

describe('coach IA', () => {
  it('répond de façon structurée à partir des données de l’utilisateur', async () => {
    const r = await ask(user.client, 'Comment économiser 100 € par mois ?')
    expect(r.error).toBeNull()
    conversationId = r.data.conversationId
    const m = r.data.message
    expect(m).toMatchObject({ role: 'assistant', is_fallback: false })
    expect(m.content.length).toBeGreaterThan(20)
    expect(m.structured.period_used.length).toBeGreaterThan(0)
    for (const a of [...m.structured.actions, ...m.structured.links]) expect(a.route).toMatch(ROUTES)
    expect(m.structured.quota).toMatchObject({ used: 1, limit: 100 })
    expect(JSON.stringify(m)).not.toMatch(/gaspill/i)
  }, 60_000)

  it('conserve l’historique de la conversation', async () => {
    const r = await ask(user.client, 'Quelles sont mes trois priorités financières ?', conversationId)
    expect(r.error).toBeNull()
    expect(r.data.conversationId).toBe(conversationId)
    const { data } = await user.client.from('coach_messages').select('role').eq('conversation_id', conversationId).order('created_at')
    expect(data!.map((x) => x.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  }, 60_000)

  it('ne prétend pas connaître une opération qui n’a pas été importée', async () => {
    const r = await ask(user.client, 'Combien ai-je dépensé chez Ikea le 3 janvier ?')
    expect(r.error).toBeNull()
    const text = `${r.data.message.content} ${r.data.message.structured.data_gaps.join(' ')}`
    expect(text).toMatch(/pas|aucun|ne figure|n’apparaît|n'apparaît|indisponible|importer|importez/i)
    expect(r.data.message.structured.facts.some((f: { text: string }) => /ikea/i.test(f.text) && /\d/.test(f.text))).toBe(false)
  }, 60_000)

  it('quota atteint : réponse de secours calculée, non décomptée', async () => {
    for (let i = 0; i < 97; i++) await admin.rpc('coach_record_usage', { p_user: user.id, p_tokens: 0, p_fallback: false })
    const r = await ask(user.client, 'Puis-je financer un achat de 600 € ?')
    expect(r.error).toBeNull()
    expect(r.data.message.is_fallback).toBe(true)
    expect(r.data.message.content).toMatch(/100 questions/)
    expect(r.data.message.structured.suggestions.length).toBeGreaterThan(0)
    expect(r.data.message.structured.quota).toMatchObject({ used: 100, limit: 100 })
  }, 60_000)

  it('offre gratuite : réponse calculée sans IA et invitation à l’offre Premium', async () => {
    const r = await ask(other.client, 'Comment économiser 100 € par mois ?')
    expect(r.error).toBeNull()
    expect(r.data.message).toMatchObject({ is_fallback: true })
    expect(r.data.message.content).toMatch(/offre Premium/)
    expect(r.data.message.structured.quota).toMatchObject({ used: 0, limit: 0 })
    await admin.from('coach_conversations').delete().eq('id', r.data.conversationId)
  }, 60_000)

  it('refuse les messages vides ou trop longs', async () => {
    expect((await ask(user.client, ' ')).error).not.toBeNull()
    expect((await ask(user.client, 'x'.repeat(1001))).error).not.toBeNull()
  })

  it('isole les conversations entre utilisateurs', async () => {
    expect((await other.client.from('coach_messages').select('id').eq('conversation_id', conversationId)).data).toEqual([])
    expect((await other.client.from('coach_conversations').select('id')).data).toEqual([])
    expect((await ask(other.client, 'Bonjour', conversationId)).error).not.toBeNull()
    // Un client ne peut pas écrire lui-même de messages (réservé au serveur).
    expect((await user.client.from('coach_messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'assistant', content: 'faux' })).error).not.toBeNull()
    // Le client ne peut pas modifier son offre.
    expect((await user.client.from('profiles').update({ plan: 'premium' }).eq('id', user.id)).error).not.toBeNull()
  }, 30_000)
})
