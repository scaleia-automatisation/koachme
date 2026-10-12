// Qualité technique et UX (cahier des charges §7.3) : liens et boutons,
// formulaires et messages d'erreur, accès selon les rôles, affichage mobile /
// tablette / ordinateur, états de chargement, d'erreur et sans données,
// accessibilité (contrastes, statuts, noms accessibles), navigation au clavier.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { admin, createTestUser, deleteTestUser, failOnPageErrors, makePremium, signIn, type TestUser } from './support.ts'

const PUBLIC = ['/', '/fonctionnalites', '/tarifs', '/securite', '/faq', '/contact', '/cgu', '/confidentialite', '/cookies', '/mentions-legales', '/abonnement-resiliation', '/connexion', '/inscription', '/mot-de-passe-oublie']
const APP = ['/app', '/app/budget?etape=revenus', '/app/budget?etape=situation', '/app/releves', '/app/depenses', '/app/coach', '/app/objectifs', '/app/progression', '/app/parametres', '/app/abonnement']
const ADMIN = ['/admin', '/admin/assistance', '/admin/technique', '/admin/ia', '/admin/offres', '/admin/faq', '/admin/securite', '/admin/equipe']

let member: TestUser // utilisateur Premium avec un budget déclaré
let staff: TestUser // administrateur
let newcomer: TestUser // compte neuf, sans aucune donnée

async function seedBudget(user: TestUser) {
  await admin.from('profiles').update({ onboarding_path: 'manual', onboarding_completed_at: new Date().toISOString() }).eq('id', user.id)
  const rows = [
    ['salaire', 210000],
    ['logement', 75000],
    ['energie_eau', 9000],
    ['alimentation', 40000],
    ['abonnements', 4500],
    ['restaurants_livraisons', 15000],
  ] as const
  await user.client.from('budget_entries').insert(rows.map(([category_code, amount_cents]) => ({ category_code, amount_cents, frequency: 'monthly', source: 'manual' })))
  await user.client.from('savings_goals').insert({ name: 'Précaution', kind: 'emergency_fund', target_cents: 300000, saved_cents: 50000 })
}

test.beforeAll(async () => {
  ;[member, staff, newcomer] = await Promise.all([createTestUser('e2e-q-membre'), createTestUser('e2e-q-admin'), createTestUser('e2e-q-nouveau')])
  await makePremium(member)
  await seedBudget(member)
  await seedBudget(staff)
  await admin.from('user_roles').insert({ user_id: staff.id, role: 'admin' })
})
test.afterAll(async () => {
  await Promise.all([member, staff, newcomer].map(deleteTestUser))
})

async function isNotFound(page: Page) {
  return page.getByRole('heading', { name: 'Page introuvable' }).isVisible()
}

/** Visite les pages, suit tous les liens internes rencontrés et vérifie qu'aucun n'aboutit à une page introuvable ou en erreur. */
async function crawl(page: Page, start: string[], scope: RegExp) {
  const seen = new Set<string>()
  const queue = [...start]
  const broken: string[] = []
  while (queue.length && seen.size < 80) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    if (await isNotFound(page)) broken.push(url)
    if (await page.getByRole('heading', { name: /Cette page n’a pas pu s’afficher/ }).isVisible()) broken.push(`${url} (erreur)`)
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))
    for (const h of hrefs) {
      const clean = h.split('#')[0]
      if (clean && scope.test(clean) && !seen.has(clean) && !clean.startsWith('/auth/')) queue.push(clean)
    }
  }
  return { visited: [...seen], broken }
}

test.describe('liens et boutons', () => {
  test('aucun lien interne cassé (site public)', async ({ page }) => {
    const checkErrors = failOnPageErrors(page)
    const { visited, broken } = await crawl(page, PUBLIC, /^\/(?!app|admin)/)
    expect(broken).toEqual([])
    expect(visited.length).toBeGreaterThanOrEqual(PUBLIC.length)
    test.info().annotations.push({ type: 'pages publiques visitées', description: String(visited.length) })
    checkErrors()
  })

  test('aucun lien interne cassé (espace connecté)', async ({ page }) => {
    const checkErrors = failOnPageErrors(page)
    await signIn(page, member, '/app')
    const { visited, broken } = await crawl(page, APP, /^\/app/)
    expect(broken).toEqual([])
    test.info().annotations.push({ type: 'pages de l’espace visitées', description: String(visited.length) })
    checkErrors()
  })

  test('une adresse inconnue affiche une page introuvable utile', async ({ page }) => {
    await page.goto('/page-qui-nexiste-pas')
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
    await page.getByRole('link', { name: 'Retour à l’accueil' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('formulaires et messages d’erreur', () => {
  test('connexion : identifiants invalides', async ({ page }) => {
    await page.goto('/connexion')
    await page.getByLabel('Email').fill('personne@example.com')
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe-1')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('alert')).toContainText(/incorrect|invalide/i)
  })

  test('inscription : mot de passe trop faible', async ({ page }) => {
    await page.goto('/inscription')
    await page.getByLabel('Email').fill('nouveau@example.com')
    await page.getByLabel('Mot de passe', { exact: true }).fill('court')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText(/8 caractères/).last()).toBeVisible()
    await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  })

  test('contact : champs obligatoires', async ({ page }) => {
    await page.goto('/contact')
    await page.getByRole('button', { name: /Envoyer/ }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
  })

  test('budget : montant invalide signalé avant enregistrement', async ({ page }) => {
    await signIn(page, newcomer, '/app/budget?etape=revenus')
    await page.getByLabel('Salaires', { exact: true }).fill('abc')
    await expect(page.getByRole('alert').first()).toBeVisible()
  })
})

test.describe('accès selon les rôles', () => {
  test('visiteur : l’espace et l’administration exigent une connexion', async ({ page }) => {
    for (const url of ['/app', '/app/parametres', '/admin']) {
      await page.goto(url)
      await page.waitForURL(/\/connexion\?suite=/)
    }
  })

  test('utilisateur : pas d’administration', async ({ page }) => {
    await signIn(page, member, '/app')
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0)
    await page.goto('/admin/equipe')
    await expect(page.getByRole('heading', { name: 'Accès réservé' })).toBeVisible()
  })

  test('administrateur : toutes les pages d’administration', async ({ page }) => {
    const checkErrors = failOnPageErrors(page)
    await signIn(page, staff, '/app')
    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible()
    for (const url of ADMIN) {
      await page.goto(url)
      await expect(page.locator('main#contenu h1')).toBeVisible()
      await expect(page.getByText('Action réservée à un autre rôle.')).toHaveCount(0)
    }
    checkErrors()
  })
})

test.describe('états de chargement, d’erreur et sans données', () => {
  test('compte neuf : chaque page explique quoi faire', async ({ page }) => {
    await signIn(page, newcomer, '/app')
    await page.waitForURL(/\/app\/bienvenue/) // pas de bilan vide : on propose de commencer
    await admin.from('profiles').update({ onboarding_path: 'manual' }).eq('id', newcomer.id)
    const expectations: [string, RegExp][] = [
      ['/app/releves', /Aucun relevé pour l’instant/],
      ['/app/objectifs', /Aucun objectif pour l’instant/],
      ['/app/progression', /Votre progression apparaîtra ici/],
      ['/app/abonnement', /Offre Découverte/],
    ]
    for (const [url, text] of expectations) {
      await page.goto(url)
      await expect(page.locator('main')).toContainText(text)
    }
  })

  test('chargement lent : un indicateur est affiché', async ({ page }) => {
    await signIn(page, member, '/app')
    await page.route('**/rest/v1/savings_goals**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.goto('/app/objectifs')
    await expect(page.getByText('Chargement…').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mes objectifs' })).toBeVisible({ timeout: 15_000 })
  })

  test('erreur réseau : message clair et bouton pour réessayer', async ({ page }) => {
    await signIn(page, member, '/app')
    await page.route('**/rest/v1/savings_goals**', (route) => route.abort())
    await page.goto('/app/objectifs')
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible({ timeout: 30_000 })
    await page.unroute('**/rest/v1/savings_goals**')
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('heading', { name: 'Mes objectifs' })).toBeVisible()
  })
})

test.describe('accessibilité (WCAG 2.1 AA, axe-core)', () => {
  async function audit(page: Page, url: string) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').first()).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    return result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${url} — ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  }

  test('pages publiques', async ({ page }) => {
    const problems: string[] = []
    for (const url of PUBLIC) problems.push(...(await audit(page, url)))
    expect(problems).toEqual([])
  })

  test('espace connecté et administration', async ({ page }) => {
    await signIn(page, staff, '/app')
    const problems: string[] = []
    for (const url of [...APP, ...ADMIN]) problems.push(...(await audit(page, url)))
    expect(problems).toEqual([])
  })
})

test.describe('navigation au clavier', () => {
  test('connexion et navigation sans souris', async ({ page }) => {
    await page.goto('/connexion')
    await page.getByLabel('Email').focus()
    await page.keyboard.type(member.email)
    await page.keyboard.press('Tab')
    await page.keyboard.type(member.password)
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.pathname === '/app')
    // Après le changement de page, le focus est sur le contenu principal
    await expect(page.locator('main#contenu')).toBeFocused()

    // Sur une page chargée, premier arrêt : le lien d'évitement
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Mon bilan', level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Aller au contenu' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()

    // Les entrées de navigation sont atteignables et leur focus est visible
    let reached = false
    for (let i = 0; i < 15 && !reached; i++) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() => document.activeElement?.textContent?.includes('Mes relevés') ?? false)
    }
    expect(reached).toBe(true)
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!)
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`
    })
    expect(outline).not.toBe('none 0px none')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/releves/)
  })

  test('le menu des notifications s’ouvre et se ferme au clavier', async ({ page }) => {
    await signIn(page, member, '/app')
    await page.getByRole('button', { name: /Notifications/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toHaveCount(0)
  })
})

test.describe('affichage mobile, tablette et ordinateur @affichage', () => {
  test('aucun débordement horizontal, contenu lisible', async ({ page }, info) => {
    const overflow: string[] = []
    const check = async (url: string) => {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('h1').first()).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (width > 1) overflow.push(`${url} (+${width}px)`)
      await info.attach(`${info.project.name}${url.replace(/[/?=]/g, '_')}.png`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' })
    }
    for (const url of ['/', '/tarifs', '/connexion']) await check(url)
    await signIn(page, member, '/app')
    for (const url of ['/app', '/app/depenses', '/app/objectifs', '/app/progression', '/app/parametres', '/app/abonnement', '/app/coach']) await check(url)
    expect(overflow).toEqual([])
  })
})
