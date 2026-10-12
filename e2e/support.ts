// Outils des scénarios de bout en bout : comptes de test (créés et supprimés
// avec la clé serveur, jamais exposée au navigateur) et connexion par l'interface.
import { expect, type Page } from '@playwright/test'
import { admin, createTestUser, deleteTestUser, makePremium, type TestUser } from '../tests/helpers.ts'

export { admin, createTestUser, deleteTestUser, makePremium, type TestUser }

/** Connexion par le formulaire, comme un utilisateur. */
export async function signIn(page: Page, user: Pick<TestUser, 'email' | 'password'>, next = '/app') {
  await page.goto(`/connexion?suite=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL((url) => url.pathname.startsWith(next.split('?')[0]))
}

/** Saisit un montant dans une ligne de budget identifiée par le libellé de sa catégorie. */
export async function fillAmount(page: Page, category: string, amount: string) {
  await page.getByLabel(category, { exact: true }).fill(amount)
}

/** Les erreurs JavaScript de la page font échouer le scénario. */
export function failOnPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return () => expect(errors, 'erreurs JavaScript dans la page').toEqual([])
}

export const uniqueEmail = (label: string) => `economiz-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`

/**
 * Inscription : la demande envoyée par le formulaire est rejouée côté serveur
 * (compte créé avec exactement les mêmes données, adresse confirmée), sans
 * envoi d'email. L'envoi réel de l'email de confirmation exige le SMTP de
 * production (Resend) et n'est pas couvert ici.
 */
export async function interceptSignup(page: Page) {
  const sent: { email?: string; data?: Record<string, unknown> } = {}
  await page.route('**/auth/v1/signup**', async (route) => {
    const body = route.request().postDataJSON() as { email: string; password: string; data?: Record<string, unknown> }
    Object.assign(sent, { email: body.email, data: body.data })
    const { data, error } = await admin.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: body.data })
    if (error || !data.user) return route.fulfill({ status: 400, json: { code: 400, error_code: 'unexpected_failure', msg: error?.message } })
    return route.fulfill({ status: 200, json: data.user })
  })
  return sent
}

/** Classe toutes les opérations « à confirmer » (catégorie générique selon le sens). */
export async function confirmAllUncertain(page: Page) {
  const section = page.locator('section[aria-labelledby="a-confirmer"]')
  const done = section.getByText('Toutes les opérations sont classées.')
  for (let i = 0; i < 30; i++) {
    const card = section.locator('.space-y-3 > div').first()
    await expect(done.or(card)).toBeVisible({ timeout: 30_000 })
    if (await done.isVisible()) return
    const credit = (await card.innerText()).includes('crédit')
    const select = card.getByRole('combobox')
    if ((await select.inputValue()) === 'a_verifier') await select.selectOption(credit ? 'autres_revenus' : 'autres_depenses')
    await card.getByRole('button', { name: 'Confirmer' }).click()
    await expect(card).toBeHidden({ timeout: 15_000 }).catch(() => undefined)
  }
  await expect(section.getByText('Toutes les opérations sont classées.')).toBeVisible()
}

/** Importe un relevé depuis « Mes relevés », attend l'analyse, classe et valide. */
export async function importAndValidate(page: Page, file: string) {
  await page.goto('/app/releves')
  const before = await page.getByRole('link', { name: 'Voir les opérations' }).count()
  await page.getByLabel('Choisir des relevés PDF').setInputFiles(file)
  const review = page.getByRole('link', { name: 'Vérifier et valider' })
  await expect(review).toBeVisible({ timeout: 200_000 })
  await review.click()
  await confirmAllUncertain(page)
  await page.getByRole('button', { name: 'Valider ce relevé' }).click()
  await expect(page.getByRole('heading', { name: 'Relevé validé' })).toBeVisible()
  return before
}
