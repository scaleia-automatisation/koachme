// Scénario E — Sécurité : données d'un autre utilisateur, relevé non autorisé,
// administration sans permission, fichiers invalides, limites d'usage,
// export et suppression du compte.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { config } from 'dotenv'
import { admin, anonClient } from '../tests/helpers.ts'
import { createTestUser, deleteTestUser, failOnPageErrors, signIn, type TestUser } from './support.ts'

config({ path: '.env.local', quiet: true })
let owner: TestUser
let intruder: TestUser
let importId: string
let filePath: string

test.beforeAll(async () => {
  owner = await createTestUser('e2e-e-victime')
  intruder = await createTestUser('e2e-e-intrus')
  await admin.from('profiles').update({ onboarding_path: 'statements' }).in('id', [owner.id, intruder.id])
  // Données du propriétaire : un relevé déposé et des lignes de budget
  filePath = `${owner.id}/${crypto.randomUUID()}.pdf`
  const bytes = readFileSync('tests/fixtures/releve-test.pdf')
  expect((await owner.client.storage.from('statements').upload(filePath, new Blob([bytes], { type: 'application/pdf' }))).error).toBeNull()
  const { data } = await owner.client.from('statement_imports').insert({ file_path: filePath, file_name: 'releve-victime.pdf', file_size: bytes.length }).select('id').single()
  importId = data!.id
  await owner.client.from('budget_entries').insert({ category_code: 'salaire', amount_cents: 300000, frequency: 'monthly', source: 'manual' })
})
test.afterAll(async () => {
  await deleteTestUser(owner)
  await deleteTestUser(intruder)
})

test('E1 — impossible d’accéder aux données d’un autre utilisateur', async ({ page }) => {
  // Par l'API, avec la session de l'intrus
  for (const table of ['statement_imports', 'budget_entries', 'profiles', 'transactions', 'savings_goals', 'notifications', 'audit_logs', 'payments', 'subscriptions']) {
    const col = table === 'profiles' ? 'id' : table === 'audit_logs' ? 'target_user_id' : 'user_id'
    const { data } = await intruder.client.from(table).select('*').eq(col, owner.id)
    expect(data ?? [], `lecture de ${table}`).toEqual([])
  }
  const upd = await intruder.client.from('budget_entries').update({ amount_cents: 1 }).eq('user_id', owner.id).select()
  expect(upd.data ?? []).toEqual([])
  const del = await intruder.client.from('statement_imports').delete().eq('id', importId).select()
  expect(del.data ?? []).toEqual([])
  expect((await admin.from('statement_imports').select('id').eq('id', importId)).data).toHaveLength(1)

  // Par l'interface : l'adresse du relevé d'un autre ne montre rien
  await signIn(page, intruder, '/app/releves')
  await page.goto(`/app/releves/${importId}`)
  await page.waitForURL((url) => url.pathname === '/app/releves' || url.pathname.startsWith('/app/releves/'))
  await expect(page.locator('main')).not.toContainText('releve-victime.pdf')
})

test('E2 — impossible de télécharger un relevé non autorisé', async () => {
  const signed = await intruder.client.storage.from('statements').createSignedUrl(filePath, 60)
  expect(signed.error).not.toBeNull()
  expect((await intruder.client.storage.from('statements').download(filePath)).error).not.toBeNull()
  expect((await anonClient().storage.from('statements').download(filePath)).error).not.toBeNull()
  const publicUrl = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/statements/${filePath}`
  expect((await fetch(publicUrl)).ok).toBe(false)
  // Le propriétaire, lui, obtient un lien temporaire (60 s)
  expect((await owner.client.storage.from('statements').createSignedUrl(filePath, 60)).data?.signedUrl).toMatch(/token=/)
})

test('E3 — administration refusée sans permission', async ({ page }) => {
  await signIn(page, intruder, '/app')
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Accès réservé' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0)
  // Même en forçant les appels, la base refuse
  expect((await intruder.client.rpc('admin_overview')).error?.message).toBe('forbidden')
  expect((await intruder.client.rpc('admin_set_role', { p_email: intruder.email, p_role: 'admin', p_grant: true })).error?.message).toBe('forbidden')
  expect((await intruder.client.from('user_roles').insert({ user_id: intruder.id, role: 'admin' })).error).not.toBeNull()
  expect((await intruder.client.from('plans').update({ monthly_price_cents: 0 }).eq('id', 'premium').select()).data ?? []).toEqual([])
  expect((await intruder.client.from('subscriptions').insert({ user_id: intruder.id, stripe_subscription_id: 'sub_forge', plan_id: 'premium', status: 'active', billing_interval: 'month' })).error).not.toBeNull()
  expect(((await intruder.client.rpc('my_entitlements')).data as { plan: string }).plan).toBe('free')
})

test('E4 — fichiers invalides refusés', async ({ page }) => {
  const checkErrors = failOnPageErrors(page)
  await signIn(page, intruder, '/app/releves')
  const input = page.getByLabel('Choisir des relevés PDF')
  // Pas un PDF
  await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') })
  await expect(page.getByText('Ce fichier n’est pas un PDF.')).toBeVisible()
  // Vide
  await input.setInputFiles({ name: 'vide.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })
  await expect(page.getByText('Ce fichier est vide.')).toBeVisible()
  // Trop volumineux
  await input.setInputFiles({ name: 'gros.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 32) })
  await expect(page.getByText('Fichier trop volumineux (10 Mo maximum).')).toBeVisible()
  // Extension .pdf mais contenu falsifié : refusé par le serveur (signature du fichier)
  await input.setInputFiles({ name: 'faux.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Ceci n’est pas un PDF') })
  await expect(page.getByText('Ce fichier n’est pas un PDF valide.')).toBeVisible({ timeout: 60_000 })
  // Dépôt direct d'un autre type dans le stockage : refusé
  const direct = await intruder.client.storage.from('statements').upload(`${intruder.id}/x.html`, new Blob(['<script>'], { type: 'text/html' }))
  expect(direct.error).not.toBeNull()
  // Dépôt dans le dossier d'un autre utilisateur : refusé
  const foreign = await intruder.client.storage.from('statements').upload(`${owner.id}/intrus.pdf`, new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
  expect(foreign.error).not.toBeNull()
  checkErrors()
})

test('E5 — limites d’usage de l’API', async ({ page }) => {
  // Formulaire de contact : 5 messages par heure et par adresse
  const email = `limite-${Date.now()}@example.com`
  const anon = anonClient()
  for (let i = 0; i < 5; i++) {
    expect((await anon.from('contact_messages').insert({ name: 'Test', email, topic: 'question', message: `Message de test numéro ${i + 1}.` })).error).toBeNull()
  }
  await page.goto('/contact')
  await page.getByLabel('Nom', { exact: true }).fill('Test limite')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Message', { exact: true }).fill('Sixième message en moins d’une heure.')
  await page.getByRole('button', { name: /Envoyer/ }).click()
  await expect(page.getByText(/Merci de patienter une heure/)).toBeVisible()
  await admin.from('contact_messages').delete().eq('email', email)

  // Offre gratuite : un seul relevé analysé par mois, le second est refusé par le serveur et non conservé
  const bytes = readFileSync('tests/fixtures/releve-test.pdf')
  const paths: string[] = []
  for (const name of ['a.pdf', 'b.pdf']) {
    const path = `${intruder.id}/${crypto.randomUUID()}.pdf`
    paths.push(path)
    await intruder.client.storage.from('statements').upload(path, new Blob([bytes], { type: 'application/pdf' }))
    await intruder.client.from('statement_imports').insert({ file_path: path, file_name: name, file_size: bytes.length, file_sha256: crypto.randomUUID().replace(/-/g, '').padEnd(64, '0') })
  }
  const { data: imps } = await intruder.client.from('statement_imports').select('id, file_name').in('file_name', ['a.pdf', 'b.pdf']).order('file_name')
  // Le premier compte dans la limite (son analyse n'est pas attendue ici) ; on le marque traité côté serveur
  await admin.from('statement_imports').update({ status: 'needs_review' }).eq('id', imps![0].id)
  const refused = await intruder.client.functions.invoke('process-statement', { body: { importId: imps![1].id } })
  expect(refused.error).not.toBeNull()
  expect(await (refused.error as { context: Response }).context.json()).toMatchObject({ error: { code: 'plan_limit_imports' } })
  expect((await admin.from('statement_imports').select('id').eq('id', imps![1].id)).data).toEqual([])

  // Fonctions protégées : session obligatoire
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  expect(res.status).toBe(401)
})

test('E6 — export puis suppression du compte', async ({ page }) => {
  const checkErrors = failOnPageErrors(page)
  await signIn(page, owner, '/app/parametres')

  // Export : uniquement les données du compte
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter mes données' }).click()
  const file = await download
  const data = JSON.parse(readFileSync((await file.path())!, 'utf8'))
  expect(data.format).toBe('economiz-export-v1')
  expect(data.statement_imports.map((i: { file_name: string }) => i.file_name)).toEqual(['releve-victime.pdf'])
  expect(data.budget_entries).toHaveLength(1)
  for (const [key, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) continue
    for (const row of rows as Record<string, unknown>[]) expect(row.user_id ?? row.id, `ligne étrangère dans ${key}`).toBe(owner.id)
  }
  await expect(page.locator('#activite')).toContainText('Export de vos données')

  // Suppression : confirmation obligatoire, puis effacement complet
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
  const remove = page.getByRole('button', { name: 'Supprimer définitivement' }).or(page.locator('#suppression button.bg-danger'))
  await expect(remove.first()).toBeDisabled()
  await page.getByLabel('Pour confirmer, saisissez SUPPRIMER').fill('SUPPRIMER')
  await remove.first().click()
  await page.waitForURL(/compte=supprime/)
  expect((await admin.auth.admin.getUserById(owner.id)).data.user).toBeNull()
  expect((await admin.storage.from('statements').list(owner.id)).data).toEqual([])
  for (const table of ['statement_imports', 'budget_entries', 'transactions']) {
    const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', owner.id)
    expect(count, table).toBe(0)
  }
  const { data: audit } = await admin.from('audit_logs').select('action').eq('action', 'account.deleted').order('created_at', { ascending: false }).limit(1)
  expect(audit).toHaveLength(1)
  checkErrors()
})
