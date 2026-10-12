// Scénario A — Parcours sans relevé : inscription, saisie des revenus et des
// charges, bilan, vérification des calculs, recommandations, objectif, coach.
import { expect, test } from '@playwright/test'
import { admin, deleteTestUser, failOnPageErrors, fillAmount, interceptSignup, makePremium, signIn, uniqueEmail, type TestUser } from './support.ts'

const euros = (n: string) => new RegExp(`${n.replace(/ /g, '\\s?')}\\s?€`)
let user: TestUser | undefined

test.afterAll(async () => {
  await deleteTestUser(user)
})

test('A — parcours sans relevé, de l’inscription au coach', async ({ page }) => {
  const checkErrors = failOnPageErrors(page)
  const email = uniqueEmail('a')
  const password = `Parcours-A-${Date.now()}`

  // 1. Inscription (les erreurs de formulaire s'affichent avant tout envoi)
  const signup = await interceptSignup(page)
  await page.goto('/inscription')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByText('Indiquez une adresse email valide')).toBeVisible()
  await expect(page.getByText('Vous devez accepter les conditions pour créer un compte')).toBeVisible()
  await page.getByLabel('Prénom (facultatif)').fill('Camille')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await page.waitForURL(/\/verifier-email/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Le formulaire a transmis l'acceptation des CGU en vigueur et le prénom
  expect(signup.email).toBe(email)
  expect(signup.data).toMatchObject({ terms_version: expect.any(String), display_name: 'Camille' })
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const created = list.users.find((u) => u.email === email)!
  const { data: profile } = await admin.from('profiles').select('terms_version, display_name').eq('id', created.id).single()
  expect(profile).toMatchObject({ terms_version: signup.data!.terms_version, display_name: 'Camille' })
  user = { id: created.id, email, password, client: undefined as never }

  await signIn(page, { email, password }, '/app')
  await page.waitForURL(/\/app\/bienvenue/)
  await expect(page.getByRole('heading', { name: /Bienvenue, Camille/ })).toBeVisible()
  await page.getByRole('button', { name: /Renseigner mes revenus et mes dépenses/ }).click()

  // 2. Revenus
  await page.waitForURL(/etape=revenus/)
  await fillAmount(page, 'Salaires', '2100')
  await fillAmount(page, 'Aides et allocations', '150')
  await page.getByRole('button', { name: 'Enregistrer et continuer' }).click()

  // 3. Charges fixes (dont une assurance annuelle)
  await page.waitForURL(/etape=charges/)
  await fillAmount(page, 'Logement (loyer, charges)', '750')
  await fillAmount(page, 'Énergie et eau', '90')
  await fillAmount(page, 'Téléphone et internet', '35')
  await fillAmount(page, 'Assurances', '600')
  await page.getByRole('listitem').filter({ hasText: 'Assurances' }).getByLabel('Fréquence').selectOption('yearly')
  await page.getByRole('button', { name: 'Enregistrer et continuer' }).click()

  // Dépenses courantes
  await page.waitForURL(/etape=depenses/)
  await fillAmount(page, 'Courses alimentaires', '400')
  await fillAmount(page, 'Transport et carburant', '120')
  await fillAmount(page, 'Restaurants et livraisons', '150')
  await page.getByRole('button', { name: 'Enregistrer et continuer' }).click()

  // 4. Situation (facultative) puis création du bilan
  await page.waitForURL(/etape=situation/)
  await page.getByRole('button', { name: 'Voir mon bilan' }).click()
  await page.waitForURL((url) => url.pathname === '/app')

  // 5. Vérification des calculs : revenus 2 250 €, dépenses 750 + 90 + 35 + 50 + 400 + 120 + 150 = 1 595 €, reste 655 €
  await expect(page.getByRole('heading', { name: 'Mon bilan', level: 1 })).toBeVisible()
  const figures = page.locator('dl').first()
  await expect(figures.getByText('Revenus mensuels').locator('..')).toContainText(euros('2 250'))
  await expect(figures.getByText('Dépenses mensuelles').locator('..')).toContainText(euros('1 595'))
  await expect(figures).toContainText(euros('655'))

  // 6. Recommandations
  const priorities = page.locator('section[aria-labelledby="priorites"]')
  await expect(priorities.getByRole('heading', { name: /action/ })).toBeVisible()
  await expect(priorities.getByText(/Action :/).first()).toBeVisible()

  // 7. Objectif
  await page.goto('/app/objectifs')
  await page.getByRole('button', { name: 'Épargne de précaution' }).click()
  await page.getByLabel('Montant cible (€)').fill('3000')
  await page.getByLabel('Montant déjà réuni (€)').fill('500')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/sur\s?3\s?000\s?€/)).toBeVisible()
  // Limite de l'offre gratuite : un seul objectif
  await expect(page.getByText('L’offre Découverte inclut un objectif d’épargne')).toBeVisible()

  // 8. Coach : encart Premium sur l'offre gratuite, puis réponse réelle une fois abonné
  await page.goto('/app/coach')
  await expect(page.getByText('Le coach IA est inclus dans l’offre Premium')).toBeVisible()
  await expect(page.getByLabel('Votre question')).toHaveCount(0)
  await makePremium({ id: created.id } as TestUser)
  await page.reload()
  await page.getByLabel('Votre question').fill('Combien me reste-t-il chaque mois ?')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText('Le coach analyse vos données…')).toBeHidden({ timeout: 90_000 })
  await expect(page.locator('section[aria-label="Conversation"]')).toContainText(euros('655'), { timeout: 10_000 })

  checkErrors()
})
