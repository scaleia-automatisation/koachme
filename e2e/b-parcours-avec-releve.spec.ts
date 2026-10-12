// Scénario B — Parcours avec relevé : import d'un PDF, extraction, catégorisation,
// doublon, revenus absents, correction des opérations incertaines, validation,
// consultation des dépenses. Extraction réelle (Edge Function + IA).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { admin, confirmAllUncertain, createTestUser, deleteTestUser, failOnPageErrors, signIn, type TestUser } from './support.ts'

const FIXTURE = 'tests/fixtures/releve-test.pdf'
const expected = JSON.parse(readFileSync('tests/fixtures/releve-test.expected.json', 'utf8'))
const euros = (n: string) => new RegExp(`${n.replace(/ /g, '\\s?')}\\s?€`)
let user: TestUser

test.beforeAll(async () => {
  user = await createTestUser('e2e-b')
})
test.afterAll(async () => {
  await deleteTestUser(user)
})

test('B — parcours avec relevé, de l’import à la consultation des dépenses', async ({ page }) => {
  const checkErrors = failOnPageErrors(page)
  await signIn(page, user, '/app')
  await page.waitForURL(/\/app\/bienvenue/)
  await page.getByRole('button', { name: /Analyser mes relevés bancaires/ }).click()
  await page.waitForURL(/\/app\/releves/)

  // 1. Import d'un PDF valide
  await page.getByLabel('Choisir des relevés PDF').setInputFiles(FIXTURE)

  // 2. Extraction des opérations (analyse réelle côté serveur)
  const review = page.getByRole('link', { name: 'Vérifier et valider' })
  await expect(review).toBeVisible({ timeout: 200_000 })
  const { data: imp } = await admin.from('statement_imports').select('id, status, balance_check, operations_count').eq('user_id', user.id).single()
  expect(imp).toMatchObject({ status: 'needs_review', balance_check: 'ok', operations_count: expected.operations })

  // 4. Détection des doublons : le même fichier est refusé avant tout envoi
  await page.getByLabel('Choisir des relevés PDF').setInputFiles(FIXTURE)
  await expect(page.getByText(/Ce fichier a déjà été importé le/)).toBeVisible()
  expect((await admin.from('statement_imports').select('id').eq('user_id', user.id)).data).toHaveLength(1)

  // 3. Catégorisation et 6. correction des opérations incertaines
  await review.click()
  await expect(page.getByText(`${expected.operations} opérations`)).toBeVisible()
  await expect(page.getByText('Lecture vérifiée')).toBeVisible()
  await confirmAllUncertain(page)
  const { data: txs } = await admin.from('transactions').select('label, ai_category_code, user_category_code').eq('import_id', imp!.id)
  // Les catégories évidentes viennent des règles, pas de l'IA : loyer, salaire, CAF, abonnement…
  expect(txs).toHaveLength(expected.operations)

  // 7. Validation du relevé
  await page.getByRole('button', { name: 'Valider ce relevé' }).click()
  await expect(page.getByRole('heading', { name: 'Relevé validé' })).toBeVisible()

  // 5. Ajout des revenus absents des relevés
  await page.goto('/app/releves')
  await page.getByRole('link', { name: /Ajouter des revenus absents de mes relevés/ }).click()
  await expect(page.getByRole('heading', { name: 'Revenus absents de vos relevés' })).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter une ligne' }).click()
  await page.getByLabel('Catégorie').selectOption('revenus_locatifs')
  await page.getByLabel('Précision (facultatif)').fill('Studio loué')
  await page.getByLabel('Montant', { exact: true }).fill('400')
  await page.getByRole('button', { name: 'Voir mon bilan' }).click()
  await page.waitForURL((url) => url.pathname === '/app')

  // Bilan : salaire 2 150 € + CAF 180 € (constatés, 2 mois) + 400 € déclarés = 2 730 €
  // Dépenses : 2 651,60 € de débits − 200 € d'épargne (livret) = 2 451,60 € sur 2 mois = 1 225,80 €
  const figures = page.locator('dl').first()
  await expect(figures.getByText('Revenus mensuels').locator('..')).toContainText(euros('2 730'))
  await expect(figures.getByText('Dépenses mensuelles').locator('..')).toContainText(euros('1 225,80'))

  // 8. Consultation des dépenses
  await page.goto('/app/depenses')
  await expect(page.getByRole('heading', { name: 'Mes dépenses', level: 1 })).toBeVisible()
  const main = page.locator('main')
  await expect(main).toContainText('Logement')
  await expect(main).toContainText(euros('720')) // loyer mensuel
  await expect(main).toContainText(/NETFLIX/i) // paiement récurrent identifié

  checkErrors()
})
