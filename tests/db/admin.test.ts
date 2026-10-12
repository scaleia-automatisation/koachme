// @vitest-environment node
// Rôles user / support / admin : permissions appliquées par la base.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers'

let user: TestUser
let support: TestUser
let boss: TestUser
let other: TestUser

beforeAll(async () => {
  ;[user, support, boss, other] = await Promise.all([createTestUser('role-user'), createTestUser('role-support'), createTestUser('role-admin'), createTestUser('role-other')])
  // Amorçage des rôles côté serveur (équivalent de npm run admin:grant).
  expect((await admin.from('user_roles').insert([{ user_id: support.id, role: 'support' }, { user_id: boss.id, role: 'admin' }])).error).toBeNull()
  await admin.from('app_logs').insert({ level: 'error', source: 'test', code: 'test_error', message: 'Erreur de test' })
}, 40_000)

afterAll(async () => {
  await admin.from('app_logs').delete().eq('source', 'test')
  await Promise.all([user, support, boss, other].map(deleteTestUser))
}, 40_000)

describe('utilisateur standard', () => {
  it('n’a aucun droit d’administration, même en le demandant', async () => {
    expect((await user.client.rpc('my_roles')).data).toEqual([])
    expect((await user.client.rpc('admin_overview')).error?.message).toBe('forbidden')
    expect((await user.client.rpc('admin_set_role', { p_email: user.email, p_role: 'admin', p_grant: true })).error?.message).toBe('forbidden')
    expect((await user.client.from('user_roles').insert({ user_id: user.id, role: 'admin' })).error).not.toBeNull()
    expect((await user.client.from('app_logs').select('id')).data).toEqual([])
    expect((await user.client.from('plans').update({ monthly_price_cents: 1 }).eq('id', 'premium').select()).data ?? []).toEqual([])
    expect((await user.client.from('faq_items').insert({ section: 'X', question: 'Question pirate ?', answer: 'Réponse pirate.' })).error).not.toBeNull()
    expect((await user.client.rpc('my_roles')).data).toEqual([])
  })
})

describe('support', () => {
  it('voit les indicateurs, les erreurs techniques et les demandes, sans pouvoir gérer les droits ni les offres', async () => {
    expect((await support.client.rpc('my_roles')).data).toEqual(['support'])
    const overview = await support.client.rpc('admin_overview')
    expect(overview.error).toBeNull()
    expect(overview.data).toHaveProperty('users_total')
    expect((await support.client.from('app_logs').select('code').eq('source', 'test')).data).toEqual([{ code: 'test_error' }])
    expect((await support.client.rpc('admin_set_role', { p_email: user.email, p_role: 'support', p_grant: true })).error?.message).toBe('forbidden')
    expect((await support.client.from('plans').update({ monthly_price_cents: 1 }).eq('id', 'premium').select()).data ?? []).toEqual([])
    expect((await support.client.rpc('admin_staff')).error?.message).toBe('forbidden')
  })

  it('ne voit jamais les opérations ni les relevés des utilisateurs', async () => {
    await user.client.from('budget_entries').insert({ category_code: 'salaire', amount_cents: 200000 })
    for (const table of ['transactions', 'statement_imports', 'budget_entries', 'financial_situations', 'coach_messages']) {
      expect((await support.client.from(table).select('*').eq('user_id', user.id)).data ?? []).toEqual([])
    }
    expect((await support.client.storage.from('statements').list(user.id)).data ?? []).toEqual([])
  })

  it('accès d’assistance : uniquement avec l’accord de l’utilisateur, limité, tracé, révocable', async () => {
    expect((await support.client.rpc('support_user_overview', { p_user: user.id })).error?.message).toBe('no_active_grant')
    // Un accord ne peut pas dépasser 7 jours.
    expect((await user.client.from('support_access_grants').insert({ reason: 'Trop long', expires_at: new Date(Date.now() + 8 * 86400_000).toISOString() })).error).not.toBeNull()
    const grant = await user.client.from('support_access_grants').insert({ reason: 'Problème d’import', expires_at: new Date(Date.now() + 2 * 86400_000).toISOString() }).select().single()
    expect(grant.error).toBeNull()

    const view = await support.client.rpc('support_user_overview', { p_user: user.id })
    expect(view.error).toBeNull()
    expect(view.data).toMatchObject({ email: user.email, budget_lines: 1, imports: [] })
    expect(JSON.stringify(view.data)).not.toMatch(/amount|label|file_path/)

    const { data: logs } = await user.client.from('audit_logs').select('action, actor_id').eq('target_user_id', user.id)
    expect(logs!.map((l) => l.action)).toEqual(expect.arrayContaining(['support.access_granted', 'support.user_viewed']))
    expect(logs!.find((l) => l.action === 'support.user_viewed')?.actor_id).toBe(support.id)

    await user.client.from('support_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', grant.data.id)
    expect((await support.client.rpc('support_user_overview', { p_user: user.id })).error?.message).toBe('no_active_grant')
  })

  it('traite les demandes de contact', async () => {
    // Adresse unique : le formulaire limite à 5 messages par heure et par email.
    const email = `support-test-${crypto.randomUUID().slice(0, 8)}@example.com`
    await admin.from('contact_messages').insert({ name: 'Test', email, topic: 'question', message: 'Demande de test pour le support.' })
    const { data } = await support.client.from('contact_messages').select('id, status').eq('email', email).single()
    expect(data?.status).toBe('new')
    const upd = await support.client.from('contact_messages').update({ status: 'resolved', resolved_at: new Date().toISOString(), internal_note: 'Répondu.' }).eq('id', data!.id).select('status').single()
    expect(upd.data?.status).toBe('resolved')
    expect((await user.client.from('contact_messages').select('id').eq('id', data!.id)).data ?? []).toEqual([])
    await admin.from('contact_messages').delete().eq('email', email)
  })
})

describe('admin', () => {
  it('gère les droits administratifs, avec journalisation', async () => {
    expect((await boss.client.rpc('admin_set_role', { p_email: other.email, p_role: 'support', p_grant: true })).error).toBeNull()
    expect((await other.client.rpc('my_roles')).data).toEqual(['support'])
    const staff = (await boss.client.rpc('admin_staff')).data as { email: string; role: string }[]
    expect(staff.map((s) => s.email)).toEqual(expect.arrayContaining([support.email, boss.email, other.email]))
    expect((await boss.client.rpc('admin_set_role', { p_email: other.email, p_role: 'support', p_grant: false })).error).toBeNull()
    expect((await other.client.rpc('my_roles')).data).toEqual([])
    expect((await boss.client.rpc('admin_set_role', { p_email: boss.email, p_role: 'admin', p_grant: false })).error?.message).toBe('cannot_revoke_self')
    const { data: logs } = await boss.client.from('audit_logs').select('action').eq('actor_id', boss.id)
    expect(logs!.map((l) => l.action)).toEqual(expect.arrayContaining(['admin.role_granted', 'admin.role_revoked']))
  })

  it('modifie les offres et limites sans toucher au code', async () => {
    const { data: before } = await boss.client.from('plans').select('limits').eq('id', 'premium').single()
    const upd = await boss.client.from('plans').update({ limits: { ...before!.limits, coach_questions_per_month: 123 } }).eq('id', 'premium').select('limits').single()
    expect(upd.data?.limits.coach_questions_per_month).toBe(123)
    expect((await boss.client.from('plans').update({ limits: { max_goals: 1 } }).eq('id', 'premium')).error).not.toBeNull()
    await boss.client.from('plans').update({ limits: before!.limits }).eq('id', 'premium')
  })

  it('gère la FAQ publique', async () => {
    const created = await boss.client.from('faq_items').insert({ section: 'Test', question: 'Question de test ?', answer: 'Réponse de test.', is_published: false }).select().single()
    expect(created.error).toBeNull()
    expect((await user.client.from('faq_items').select('id').eq('id', created.data.id)).data).toEqual([])
    await boss.client.from('faq_items').update({ is_published: true }).eq('id', created.data.id)
    expect((await user.client.from('faq_items').select('id').eq('id', created.data.id)).data).toHaveLength(1)
    await boss.client.from('faq_items').delete().eq('id', created.data.id)
  })

  it('consulte les indicateurs agrégés et la consommation IA', async () => {
    expect((await boss.client.rpc('admin_signups_series', { p_days: 7 })).data).toHaveLength(7)
    expect((await boss.client.rpc('admin_ai_usage', { p_days: 30 })).error).toBeNull()
    expect((await boss.client.rpc('admin_failed_imports', { p_limit: 10 })).error).toBeNull()
    expect((await boss.client.rpc('admin_find_user', { p_email: user.email })).data).toHaveLength(1)
  })
})
