// Tests de bout en bout dans un vrai navigateur (Chrome installé sur le poste,
// aucun navigateur téléchargé). Ils s'exécutent contre le serveur de
// développement et le projet Supabase réel, avec des comptes de test créés puis
// supprimés à chaque scénario.
//
//   npm run e2e            → tous les scénarios
//   npm run e2e -- --ui    → mode interactif
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'performance/**',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/resultats.json' }]],
  use: {
    baseURL: 'http://localhost:5180',
    channel: 'chrome',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'tablette', use: { ...devices['iPad (gen 7)'], browserName: 'chromium', channel: 'chrome' }, grep: /@affichage/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' }, grep: /@affichage/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
