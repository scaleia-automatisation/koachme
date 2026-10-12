// Mesure des performances sur le build de production (vite build + preview),
// et non sur le serveur de développement.   npm run e2e:perf
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e/performance',
  timeout: 120_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/performance.json' }]],
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://localhost:4180', locale: 'fr-FR' },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    // Mobile avec réseau 4G et processeur ralenti (conditions défavorables)
    { name: 'mobile-4g', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
