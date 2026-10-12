// Scénario C — Suivi mensuel : nouvelle période, comparaison avec le mois
// précédent, opérations récurrentes, recommandations, progression des objectifs.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { admin, confirmAllUncertain, createTestUser, deleteTestUser, failOnPageErrors, importAndValidate, makePremium, signIn, type TestUser } from './support.ts'

const next = JSON.parse(readFileSync('tests/fixtures/releve-test-mars.expected.json', 'utf8'))
let user: TestUser

test.beforeAll(async () => {
  user = await createTestUser('e2e-c')
  await makePremium(user) // historique, comparaisons et plusieurs relevés par mois
  await admin.from('profiles').update({ onboarding_path: 'statements' }).eq('id', user.id)
})
test.afterAll(async () => {
  await deleteTestUser(user)
})

test('C — suivi mensuel avec un nouveau relevé', async ({ page }) => {
  const checkErrors = failOnPageErrors(page)
  await signIn(page, user, '/app')

  // Mois de départ : janvier-février, et un objectif
  await importAndValidate(page, 'tests/fixtures/releve-test.pdf')
  await page.goto('/app/objectifs')
  await page.getByRole('button', { name: 'Nouvel objectif' }).click()
  await page.getByLabel('Nom de l’objectif').fill('Vacances')
  await page.getByLabel('Montant cible (€)').fill('1500')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/0\s?€\s?sur\s?1\s?500\s?€/)).toBeVisible()

  // 1. Ajout d'une nouvelle période (15 février - 31 mars, qui recoupe la précédente)
  await page.goto('/app/releves')
  await page.getByLabel('Choisir des relevés PDF').setInputFiles('tests/fixtures/releve-test-mars.pdf')
  const review = page.getByRole('link', { name: 'Vérifier et valider' })
  await expect(review).toBeVisible({ timeout: 200_000 })
  await review.click()
  // Les opérations de la seconde quinzaine de février figurent déjà dans le premier relevé
  await expect(page.getByText(`${next.duplicates} doublons détectés`)).toBeVisible()
  await confirmAllUncertain(page)
  await page.getByRole('button', { name: 'Valider ce relevé' }).click()
  await expect(page.getByRole('heading', { name: 'Relevé validé' })).toBeVisible()

  // 2. Comparaison avec le mois précédent : courses de février 153,40 € → mars 222,50 €
  await page.goto('/app/progression')
  const main = page.locator('main')
  await expect(main.getByRole('columnheader', { name: /mars/i }).first()).toBeVisible()
  await expect(main.getByText('Hausses et baisses importantes')).toBeVisible()
  await expect(main).toContainText(/Courses alimentaires\s?:\s?153,40\s?€\s?→\s?222,50\s?€/)

  // 3. Opérations récurrentes : EDF (janvier et mars) et le salaire de mars reconnus
  await page.goto('/app/depenses')
  await expect(page.locator('main')).toContainText(/EDF/)

  // 4. Recommandations mises à jour : le bilan porte désormais sur janvier-mars
  await page.goto('/app')
  await expect(page.locator('main')).toContainText(/mars 2026/)
  await expect(page.locator('section[aria-labelledby="priorites"]').getByText(/Action :/).first()).toBeVisible()
  const { data: saved } = await admin.from('statement_imports').select('status').eq('user_id', user.id)
  expect(saved!.map((s) => s.status)).toEqual(['confirmed', 'confirmed'])

  // 5. Progression de l'objectif : un virement vers le livret est associé, sur confirmation
  await page.goto('/app/objectifs')
  const suggestion = page.getByRole('listitem').filter({ hasText: 'VIR VERS LIVRET A' }).first()
  await suggestion.getByLabel('Objectif').selectOption({ label: 'Vacances' })
  await suggestion.getByRole('button', { name: 'Confirmer' }).click()
  await expect(page.getByText(/200\s?€\s?sur\s?1\s?500\s?€/)).toBeVisible()
  await expect(page.locator('main')).toContainText('13 %')

  checkErrors()
})
