// Performances des pages principales : temps d'affichage du contenu principal
// (LCP), décalages de mise en page (CLS), poids du JavaScript téléchargé.
import { expect, test, type Page } from '@playwright/test'
import { admin, createTestUser, deleteTestUser, signIn, type TestUser } from '../support.ts'

// Seuils « bons » des Core Web Vitals (Google) ; plus tolérants en 4G simulée.
const LIMITS = { ordinateur: { lcp: 2500, cls: 0.1, js: 400_000 }, 'mobile-4g': { lcp: 4000, cls: 0.1, js: 400_000 } }
let user: TestUser

test.beforeAll(async () => {
  user = await createTestUser('perf')
  await admin.from('profiles').update({ onboarding_path: 'manual', onboarding_completed_at: new Date().toISOString() }).eq('id', user.id)
  await user.client.from('budget_entries').insert([
    { category_code: 'salaire', amount_cents: 210000, frequency: 'monthly', source: 'manual' },
    { category_code: 'logement', amount_cents: 75000, frequency: 'monthly', source: 'manual' },
    { category_code: 'alimentation', amount_cents: 40000, frequency: 'monthly', source: 'manual' },
  ])
})
test.afterAll(async () => {
  await deleteTestUser(user)
})

async function throttle(page: Page, project: string) {
  if (project !== 'mobile-4g') return
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

async function measure(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
  // Le LCP est publié une fois l'affichage stabilisé (plus tard sous ralentissement).
  await page.waitForFunction(() => (window as unknown as { __vitals?: { lcp: number } }).__vitals?.lcp, undefined, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(300)
  return page.evaluate(() => {
    const vitals = (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals
    const { lcp, cls } = vitals
    const js = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((r) => r.name.endsWith('.js'))
      .reduce((s, r) => s + (r.transferSize || r.encodedBodySize), 0)
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return { lcp: Math.round(lcp), cls: Math.round(cls * 1000) / 1000, js, domReady: Math.round(nav.domContentLoadedEventEnd) }
  })
}

for (const url of ['/', '/tarifs', '/connexion']) {
  test(`page publique ${url}`, async ({ page }, info) => {
    await page.addInitScript(() => {
      // LCP et CLS ne sont exposés que par un observateur de performance.
      const vitals = { lcp: 0, cls: 0 }
      ;(window as unknown as { __vitals: typeof vitals }).__vitals = vitals
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) vitals.lcp = e.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) vitals.cls += e.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await throttle(page, info.project.name)
    const m = await measure(page, url)
    info.annotations.push({ type: 'mesures', description: JSON.stringify(m) })
    const limit = LIMITS[info.project.name as keyof typeof LIMITS]
    expect(m.lcp, 'LCP mesuré').toBeGreaterThan(0)
    expect(m.lcp, 'LCP (ms)').toBeLessThan(limit.lcp)
    expect(m.cls, 'CLS').toBeLessThan(limit.cls)
    expect(m.js, 'JavaScript téléchargé (octets compressés)').toBeLessThan(limit.js)
  })
}

test('bilan (espace connecté)', async ({ page }, info) => {
  await signIn(page, user, '/app')
  await throttle(page, info.project.name)
  const started = Date.now()
  await page.reload()
  await expect(page.getByText('Revenus mensuels')).toBeVisible({ timeout: 30_000 })
  const ready = Date.now() - started
  info.annotations.push({ type: 'mesures', description: JSON.stringify({ bilanAffiche: ready }) })
  expect(ready, 'bilan affiché (ms)').toBeLessThan(info.project.name === 'mobile-4g' ? 6000 : 3000)
})

test('aucune violation de la politique de sécurité du contenu (CSP de production)', async ({ page }, info) => {
  test.skip(info.project.name !== 'ordinateur', 'une seule passe suffit')
  const violations: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;((window as unknown as { __csp?: string[] }).__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text())
  })
  const res = await page.goto('/')
  expect(res?.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(res?.headers()['x-frame-options']).toBe('DENY')
  for (const url of ['/', '/tarifs', '/faq', '/connexion']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
  }
  await signIn(page, user, '/app')
  for (const url of ['/app', '/app/depenses', '/app/progression', '/app/objectifs', '/app/coach', '/app/abonnement', '/app/parametres']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    violations.push(...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])) as string[]))
  }
  expect(violations).toEqual([])
})
