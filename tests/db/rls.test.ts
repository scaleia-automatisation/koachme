// @vitest-environment node
// Isolation des données entre utilisateurs (RLS) et droits des visiteurs anonymes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createTestUser, deleteTestUser, makePremium, TERMS_VERSION, type TestUser } from '../helpers'

let a: TestUser
let b: TestUser

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('rls-a'), createTestUser('rls-b')])
  // Plusieurs objectifs : offre Premium (les limites sont testées dans billing.test.ts).
  await Promise.all([makePremium(a), makePremium(b)])
}, 30_000)

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
}, 30_000)

describe('profils', () => {
  it('sont créés à l’inscription avec la version des CGU acceptée', async () => {
    const { data } = await a.client.from('profiles').select('*').single()
    expect(data).toMatchObject({ id: a.id, display_name: 'Test rls-a', terms_version: TERMS_VERSION })
    expect(data?.terms_accepted_at).not.toBeNull()
  })

  it('ne sont visibles que par leur propriétaire', async () => {
    const { data } = await a.client.from('profiles').select('id')
    expect(data).toEqual([{ id: a.id }])
    const anon = await anonClient().from('profiles').select('id')
    expect(anon.data ?? []).toEqual([])
  })

  it('ne peuvent pas être modifiés par un autre utilisateur', async () => {
    const { data } = await b.client.from('profiles').update({ display_name: 'Piraté' }).eq('id', a.id).select()
    expect(data).toEqual([])
    const { data: own } = await a.client.from('profiles').update({ onboarding_path: 'manual' }).eq('id', a.id).select('onboarding_path').single()
    expect(own?.onboarding_path).toBe('manual')
  })
})

describe('lignes de budget', () => {
  it('CRUD complet pour le propriétaire, invisible pour les autres', async () => {
    const created = await a.client
      .from('budget_entries')
      .insert({ category_code: 'salaire', amount_cents: 210000, frequency: 'monthly' })
      .select()
      .single()
    expect(created.error).toBeNull()
    expect(created.data.user_id).toBe(a.id)

    expect((await b.client.from('budget_entries').select('id')).data).toEqual([])
    const hijack = await b.client.from('budget_entries').update({ amount_cents: 1 }).eq('id', created.data.id).select()
    expect(hijack.data).toEqual([])
    const del = await b.client.from('budget_entries').delete().eq('id', created.data.id).select()
    expect(del.data).toEqual([])

    const upd = await a.client.from('budget_entries').update({ amount_cents: 220000 }).eq('id', created.data.id).select().single()
    expect(upd.data.amount_cents).toBe(220000)
    const own = await a.client.from('budget_entries').delete().eq('id', created.data.id).select()
    expect(own.data).toHaveLength(1)
  })

  it('refuse d’écrire pour le compte d’un autre utilisateur', async () => {
    const r = await b.client.from('budget_entries').insert({ user_id: a.id, category_code: 'salaire', amount_cents: 100 })
    expect(r.error).not.toBeNull()
  })

  it('refuse les montants négatifs et les catégories inconnues', async () => {
    expect((await a.client.from('budget_entries').insert({ category_code: 'salaire', amount_cents: -5 })).error).not.toBeNull()
    expect((await a.client.from('budget_entries').insert({ category_code: 'inconnue', amount_cents: 5 })).error).not.toBeNull()
  })
})

describe('situation financière', () => {
  it('upsert pour le propriétaire uniquement', async () => {
    const up = await a.client.from('financial_situations').upsert({ household_size: 3, main_goal: 'reduce_debt' }).select().single()
    expect(up.error).toBeNull()
    expect((await b.client.from('financial_situations').select('*')).data).toEqual([])
  })
})

describe('objectifs d’épargne', () => {
  it('CRUD pour le propriétaire uniquement, montants validés', async () => {
    const g = await a.client.from('savings_goals').insert({ name: 'Vacances', target_cents: 120000, saved_cents: 10000, target_date: '2026-12-31' }).select().single()
    expect(g.error).toBeNull()
    expect((await b.client.from('savings_goals').select('id')).data).toEqual([])
    expect((await b.client.from('savings_goals').update({ saved_cents: 0 }).eq('id', g.data.id).select()).data).toEqual([])
    expect((await a.client.from('savings_goals').insert({ name: 'X', target_cents: 0 })).error).not.toBeNull()
    expect((await a.client.from('savings_goals').delete().eq('id', g.data.id).select()).data).toHaveLength(1)
  })
})

describe('suivi : contributions, actions, avis, bilans mensuels', () => {
  it('une contribution ne peut viser que ses propres objectifs', async () => {
    const goalA = (await a.client.from('savings_goals').insert({ name: 'A', target_cents: 50000 }).select().single()).data
    const goalB = (await b.client.from('savings_goals').insert({ name: 'B', target_cents: 50000 }).select().single()).data
    expect((await a.client.from('goal_contributions').insert({ goal_id: goalA.id, amount_cents: 1000 })).error).toBeNull()
    expect((await a.client.from('goal_contributions').insert({ goal_id: goalB.id, amount_cents: 1000 })).error).not.toBeNull()
    expect((await b.client.from('goal_contributions').select('id')).data).toEqual([])
    expect((await a.client.from('goal_contributions').insert({ goal_id: goalA.id, amount_cents: 0 })).error).not.toBeNull()
  })

  it('actions, avis et bilans mensuels restent privés', async () => {
    expect((await a.client.from('recommendation_actions').upsert({ rec_key: 'recurring:bank_fees', status: 'done', confirmed_saving_cents: 600 })).error).toBeNull()
    expect((await a.client.from('subscription_reviews').upsert({ merchant_key: 'NETFLIX', verdict: 'useful' })).error).toBeNull()
    expect((await a.client.from('monthly_reports').upsert({ period: '2026-10', snapshot: { version: 1 } })).error).toBeNull()
    for (const table of ['recommendation_actions', 'subscription_reviews', 'monthly_reports']) {
      expect((await b.client.from(table).select('*')).data).toEqual([])
      expect((await a.client.from(table).select('*')).data).toHaveLength(1)
    }
    expect((await a.client.from('monthly_reports').upsert({ period: '2026-13', snapshot: {} })).error).not.toBeNull()
    expect((await b.client.from('recommendation_actions').insert({ user_id: a.id, rec_key: 'x:y', status: 'todo' })).error).not.toBeNull()
  })

  it('un même fichier ne peut pas être importé deux fois', async () => {
    const sha = 'a'.repeat(64)
    expect((await a.client.from('statement_imports').insert({ file_path: `${a.id}/s1.pdf`, file_name: 's1.pdf', file_size: 10, file_sha256: sha })).error).toBeNull()
    expect((await a.client.from('statement_imports').insert({ file_path: `${a.id}/s2.pdf`, file_name: 's2.pdf', file_size: 10, file_sha256: sha })).error).not.toBeNull()
    // Le même fichier reste importable par un autre utilisateur (empreinte par utilisateur).
    expect((await b.client.from('statement_imports').insert({ file_path: `${b.id}/s1.pdf`, file_name: 's1.pdf', file_size: 10, file_sha256: sha })).error).toBeNull()
  })
})

describe('imports et opérations', () => {
  it('un utilisateur ne peut pas créer d’opérations ni forcer le statut d’un import', async () => {
    const imp = await a.client
      .from('statement_imports')
      .insert({ file_path: `${a.id}/manuel.pdf`, file_name: 'manuel.pdf', file_size: 100 })
      .select()
      .single()
    expect(imp.error).toBeNull()
    expect(imp.data.status).toBe('uploaded')

    const forged = await a.client.from('statement_imports').update({ status: 'confirmed' }).eq('id', imp.data.id).select()
    expect(forged.data).toEqual([])

    const tx = await a.client.from('transactions').insert({ user_id: a.id, import_id: imp.data.id, position: 0, op_date: '2026-01-01', label: 'x', amount_cents: 1 })
    expect(tx.error).not.toBeNull()

    expect((await b.client.from('statement_imports').select('id').eq('id', imp.data.id)).data).toEqual([])
  })

  it('refuse un chemin de fichier dans le dossier d’un autre utilisateur', async () => {
    const r = await a.client.from('statement_imports').insert({ file_path: `${b.id}/vol.pdf`, file_name: 'vol.pdf', file_size: 100 })
    expect(r.error).not.toBeNull()
  })
})

describe('stockage des relevés', () => {
  const pdf = new Blob([new TextEncoder().encode('%PDF-1.4 test')], { type: 'application/pdf' })

  it('chacun dépose et lit uniquement dans son dossier', async () => {
    expect((await a.client.storage.from('statements').upload(`${a.id}/test.pdf`, pdf)).error).toBeNull()
    expect((await b.client.storage.from('statements').upload(`${a.id}/intrus.pdf`, pdf)).error).not.toBeNull()
    expect((await b.client.storage.from('statements').download(`${a.id}/test.pdf`)).error).not.toBeNull()
    expect((await anonClient().storage.from('statements').download(`${a.id}/test.pdf`)).error).not.toBeNull()
    expect((await a.client.storage.from('statements').download(`${a.id}/test.pdf`)).error).toBeNull()
  })

  it('refuse les fichiers qui ne sont pas des PDF', async () => {
    const txt = new Blob(['bonjour'], { type: 'text/plain' })
    expect((await a.client.storage.from('statements').upload(`${a.id}/note.txt`, txt)).error).not.toBeNull()
  })
})

describe('messages de contact', () => {
  it('un visiteur peut écrire mais personne ne peut relire via l’API', async () => {
    const anon = anonClient()
    const ins = await anon.from('contact_messages').insert({ name: 'Test', email: 'test@example.com', topic: 'question', message: 'Message de test automatisé.' })
    expect(ins.error).toBeNull()
    expect((await anon.from('contact_messages').select('*')).data ?? []).toEqual([])
    expect((await a.client.from('contact_messages').select('*')).data ?? []).toEqual([])
    await admin.from('contact_messages').delete().eq('email', 'test@example.com')
  })

  it('valide le contenu', async () => {
    const r = await anonClient().from('contact_messages').insert({ name: 'T', email: 'pas-un-email', topic: 'question', message: 'court' })
    expect(r.error).not.toBeNull()
  })
})
