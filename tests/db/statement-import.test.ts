// @vitest-environment node
// Chaîne d'import complète contre le projet distant : dépôt du PDF,
// traitement par l'Edge Function (extraction réelle), OCR avec accord,
// contrôle des soldes, traçabilité, puis suppression du compte.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, createTestUser, deleteTestUser, makePremium, type TestUser } from '../helpers'

const expected = JSON.parse(readFileSync('tests/fixtures/releve-test.expected.json', 'utf8'))
let user: TestUser

beforeAll(async () => {
  user = await createTestUser('import')
  // Plusieurs relevés dans le mois : offre Premium.
  await makePremium(user)
}, 30_000)

afterAll(async () => {
  await deleteTestUser(user)
}, 30_000)

async function upload(path: string, name: string) {
  const bytes = readFileSync(path)
  const filePath = `${user.id}/${crypto.randomUUID()}.pdf`
  expect((await user.client.storage.from('statements').upload(filePath, new Blob([bytes], { type: 'application/pdf' }))).error).toBeNull()
  const { data: imp, error } = await user.client.from('statement_imports').insert({ file_path: filePath, file_name: name, file_size: bytes.length }).select().single()
  expect(error).toBeNull()
  return imp.id as string
}

async function process(id: string, allowOcr = false) {
  const invoke = await user.client.functions.invoke('process-statement', { body: { importId: id, allowOcr } })
  expect(invoke.error).toBeNull()
  expect(invoke.data).toEqual({ status: 'processing' })
}

async function waitForImport(id: string) {
  const deadline = Date.now() + 170_000
  while (Date.now() < deadline) {
    const { data } = await user.client.from('statement_imports').select('*').eq('id', id).single()
    if (data && !['uploaded', 'processing'].includes(data.status)) return data
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Délai de traitement dépassé')
}

async function checkStatement(id: string, method: 'text' | 'ocr') {
  const imp = await waitForImport(id)
  expect(imp).toMatchObject({
    status: 'needs_review',
    operations_count: expected.operations,
    balance_check: 'ok',
    balance_gap_cents: 0,
    opening_balance_cents: expected.opening,
    closing_balance_cents: expected.closing,
    period_start: '2026-01-01',
    period_end: '2026-02-28',
    currency: 'EUR',
    extraction_method: method,
  })
  // Seuls les 4 derniers chiffres du compte sont conservés.
  expect(imp.account_label).toContain('1234')
  expect(imp.account_label).not.toMatch(/FR76|3000 4000/)

  const { data: txs } = await user.client.from('transactions').select('*').eq('import_id', id).order('position')
  expect(txs).toHaveLength(expected.operations)
  expect(txs!.reduce((s, t) => s + Number(t.amount_cents), 0)).toBe(expected.sum)
  expect(txs!.every((t) => t.currency === 'EUR' && t.is_pending === false && t.review_status === 'auto')).toBe(true)
  expect(txs!.find((t) => t.label.includes('SALAIRE JANVIER'))).toMatchObject({ op_date: '2026-01-28', amount_cents: 215000 })
  expect(txs!.find((t) => t.label.includes('LOYER JANVIER'))).toMatchObject({ op_date: '2026-01-02', amount_cents: -72000 })
  return txs!
}

describe('import d’un relevé PDF texte', () => {
  let importId: string

  it('extrait toutes les opérations normalisées avec des soldes cohérents', async () => {
    importId = await upload('tests/fixtures/releve-test.pdf', 'releve-test.pdf')
    await process(importId)
    const txs = await checkStatement(importId, 'text')
    expect(txs.every((t) => t.page === 1 || t.page === null)).toBe(true)
  }, 200_000)

  it('l’utilisateur peut corriger et confirmer, sans toucher aux données extraites', async () => {
    const { data: tx } = await user.client.from('transactions').select('id').eq('import_id', importId).limit(1).single()
    const upd = await user.client
      .from('transactions')
      .update({ user_category_code: 'loisirs_sorties', review_status: 'corrected', user_exceptional: true })
      .eq('id', tx!.id)
      .select()
      .single()
    expect(upd.data).toMatchObject({ user_category_code: 'loisirs_sorties', review_status: 'corrected', user_exceptional: true })
    for (const forged of [{ amount_cents: 1 }, { is_pending: true }, { currency: 'USD' }, { op_date: '2020-01-01' }]) {
      expect((await user.client.from('transactions').update(forged).eq('id', tx!.id).select()).error).not.toBeNull()
    }
    const conf = await user.client.from('statement_imports').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', importId).select().single()
    expect(conf.data.status).toBe('confirmed')
  })
})

describe('documents scannés (OCR)', () => {
  it('refuse un scan sans accord explicite, sans rien enregistrer', async () => {
    const id = await upload('tests/fixtures/releve-scanne-lisible.pdf', 'scan.pdf')
    await process(id)
    expect(await waitForImport(id)).toMatchObject({ status: 'failed', error_code: 'needs_ocr', operations_count: 0 })
  }, 60_000)

  it('avec l’accord de l’utilisateur, lit le scan par OCR et contrôle les soldes', async () => {
    const { data: imp } = await user.client.from('statement_imports').select('id').eq('error_code', 'needs_ocr').single()
    await process(imp!.id, true)
    await checkStatement(imp!.id, 'ocr')
  }, 200_000)

  it('un document illisible même en OCR échoue, l’import n’est jamais considéré réussi', async () => {
    const id = await upload('tests/fixtures/releve-scanne.pdf', 'vide.pdf')
    await process(id, true)
    const imp = await waitForImport(id)
    expect(imp.status).toBe('failed')
    expect(['not_statement', 'no_operations']).toContain(imp.error_code)
    expect((await user.client.from('transactions').select('id').eq('import_id', id)).data).toEqual([])
  }, 200_000)
})

describe('sécurité de la fonction d’import', () => {
  it('refuse l’analyse d’un import appartenant à un autre utilisateur', async () => {
    const other = await createTestUser('intrus')
    try {
      const { data: imp } = await user.client.from('statement_imports').select('id').limit(1).single()
      const r = await other.client.functions.invoke('process-statement', { body: { importId: imp!.id } })
      expect(r.error).not.toBeNull()
    } finally {
      await deleteTestUser(other)
    }
  }, 30_000)
})

describe('suppression du compte', () => {
  it('exige une confirmation explicite', async () => {
    expect((await user.client.functions.invoke('delete-account', { body: { confirmation: 'oui' } })).error).not.toBeNull()
  })

  it('supprime le compte, ses fichiers et toutes ses données', async () => {
    const r = await user.client.functions.invoke('delete-account', { body: { confirmation: 'SUPPRIMER' } })
    expect(r.error).toBeNull()
    expect(r.data).toEqual({ deleted: true })
    expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull()
    expect((await admin.storage.from('statements').list(user.id)).data).toEqual([])
    for (const table of ['profiles', 'statement_imports', 'transactions', 'savings_goals']) {
      const col = table === 'profiles' ? 'id' : 'user_id'
      const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(col, user.id)
      expect(count).toBe(0)
    }
  }, 30_000)
})
