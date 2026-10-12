// Scénario D — Paiement : souscription, confirmation par webhook, droits
// Premium, changement de formule, paiement échoué, annulation, résiliation,
// et vérification des droits après chaque événement.
//
// Sans clé Stripe de test (STRIPE_SECRET_KEY), la page de paiement Stripe ne
// peut pas s'ouvrir : le scénario vérifie que l'interface le dit clairement,
// puis envoie au webhook déployé les événements signés que Stripe enverrait.
import { expect, test, type Page } from '@playwright/test'
import { createTestUser, deleteTestUser, failOnPageErrors, signIn, type TestUser } from './support.ts'
import { sendStripeEvent, stripeInvoice, stripeSubscription } from './stripe.ts'

let user: TestUser
const ids = { customer: `cus_e2e${Date.now()}`, subscription: `sub_e2e${Date.now()}` }

test.beforeAll(async () => {
  user = await createTestUser('e2e-d')
})
test.afterAll(async () => {
  await deleteTestUser(user)
})

async function plan(page: Page) {
  await page.goto('/app/abonnement')
  const card = page.locator('main').getByRole('heading', { name: /^Offre / })
  await expect(card).toBeVisible()
  return card.locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
}

async function coachAvailable(page: Page) {
  await page.goto('/app/coach')
  const form = page.getByLabel('Votre question')
  const upsell = page.getByText('Le coach IA est inclus dans l’offre Premium')
  await expect(form.or(upsell)).toBeVisible()
  return form.isVisible()
}

test('D — cycle de vie complet d’un abonnement', async ({ page }) => {
  const checkErrors = failOnPageErrors(page)
  await signIn(page, user, '/app/abonnement')

  // Offre gratuite au départ, coach non inclus
  await expect(page.getByRole('heading', { name: 'Offre Découverte' })).toBeVisible()
  expect(await coachAvailable(page)).toBe(false)

  // 1. Souscription : sans clé Stripe, l'impossibilité est clairement indiquée (aucune offre activée)
  await page.goto('/app/abonnement')
  await expect(page.getByRole('button', { name: /Souscrire/ })).toBeDisabled()
  await page.getByRole('checkbox', { name: /bénéficier de Premium dès maintenant/ }).check()
  await page.getByRole('button', { name: /Souscrire/ }).click()
  if (process.env.STRIPE_SECRET_KEY) {
    await page.waitForURL(/checkout\.stripe\.com/)
    await page.goBack()
  } else {
    await expect(page.getByText('Le paiement en ligne n’est pas encore ouvert.', { exact: false })).toBeVisible()
  }
  // Un retour de paiement simulé dans l'URL n'active rien
  await page.goto('/app/abonnement?paiement=retour')
  await expect(page.getByText('Confirmation de votre paiement en cours')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Offre Découverte' })).toBeVisible()

  // 2. Confirmation via webhook (session de paiement terminée, abonnement créé, facture payée)
  await sendStripeEvent('checkout.session.completed', { id: 'cs_test_e2e', object: 'checkout.session', customer: ids.customer, client_reference_id: user.id, metadata: { user_id: user.id } })
  await sendStripeEvent('customer.subscription.created', stripeSubscription(user.id, ids, 'active'))
  await sendStripeEvent('invoice.paid', stripeInvoice(ids, `in_e2e_paid_${Date.now()}`, { amount_paid: 599 }))

  // 3. Activation des droits Premium (la page de retour les détecte d'elle-même)
  await expect(page.getByText('Paiement confirmé : votre offre Premium est active')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Offre Premium' })).toBeVisible()
  await expect(page.getByText('Actif', { exact: true })).toBeVisible()
  await expect(page.getByText(/Formule mensuelle · prochain renouvellement/)).toBeVisible()
  await expect(page.getByText(/5,99\s?€ · Payée/)).toBeVisible()
  expect(await coachAvailable(page)).toBe(true)

  // 4. Changement de formule : passage à l'annuel
  await sendStripeEvent('customer.subscription.updated', stripeSubscription(user.id, ids, 'active', { interval: 'year', periodEnd: Math.floor(Date.now() / 1000) + 365 * 86400 }))
  await plan(page)
  await expect(page.getByText(/Formule annuelle · prochain renouvellement/)).toBeVisible()
  await page.getByRole('button', { name: /Notifications/ }).click()
  await expect(page.getByRole('dialog', { name: 'Notifications' }).getByText('Formule modifiée')).toBeVisible()
  await page.keyboard.press('Escape')

  // 5. Paiement échoué : statut « Paiement en attente », droits conservés pendant les relances
  await sendStripeEvent('invoice.payment_failed', stripeInvoice(ids, `in_e2e_failed_${Date.now()}`, { amount_due: 5990 }))
  await sendStripeEvent('customer.subscription.updated', stripeSubscription(user.id, ids, 'past_due', { interval: 'year' }))
  await plan(page)
  await expect(page.getByText('Paiement en attente', { exact: true })).toBeVisible()
  await expect(page.getByText(/Votre dernier paiement n’a pas abouti/)).toBeVisible()
  await expect(page.getByText(/59,90\s?€ · Échec/)).toBeVisible()
  expect(await coachAvailable(page)).toBe(true)

  // Paiement régularisé
  await sendStripeEvent('customer.subscription.updated', stripeSubscription(user.id, ids, 'active', { interval: 'year' }))
  await plan(page)
  await expect(page.getByText('Actif', { exact: true })).toBeVisible()
  // La résiliation en ligne est proposée directement
  await expect(page.getByRole('button', { name: 'Résilier mon abonnement' })).toBeVisible()

  // 6. Annulation (fin de période) : droits conservés jusqu'à l'échéance
  await sendStripeEvent('customer.subscription.updated', stripeSubscription(user.id, ids, 'active', { interval: 'year', cancelAtPeriodEnd: true }))
  await plan(page)
  await expect(page.getByText(/accès Premium jusqu’au .*, sans renouvellement/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Résilier mon abonnement' })).toHaveCount(0)
  expect(await coachAvailable(page)).toBe(true)

  // Résiliation effective : retour à l'offre gratuite, données conservées
  const past = Math.floor(Date.now() / 1000) - 60
  await sendStripeEvent('customer.subscription.deleted', stripeSubscription(user.id, ids, 'canceled', { interval: 'year', periodEnd: past }))
  await plan(page)
  await expect(page.getByRole('heading', { name: 'Offre Découverte' })).toBeVisible()
  await expect(page.getByText(/5,99\s?€ · Payée/)).toBeVisible() // historique des factures conservé
  expect(await coachAvailable(page)).toBe(false)

  checkErrors()
})
