/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// En-têtes de sécurité de production (vercel.json), appliqués aussi à « vite preview »
// pour que les tests sur le build vérifient l'application sous la même politique (CSP…).
const productionHeaders: Record<string, string> = Object.fromEntries(
  (JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'vercel.json'), 'utf8')).headers[0].headers as { key: string; value: string }[])
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests', '') : h.value]),
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { port: 5180, strictPort: true },
  preview: { headers: productionHeaders },
  build: {
    rollupOptions: {
      output: {
        // Bibliothèques séparées du code de l'application : mises en cache indépendamment.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'vendor-react'
          if (/node_modules\/@supabase\//.test(id)) return 'vendor-supabase'
          if (/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(id)) return 'vendor-motion'
          if (/node_modules\/@tanstack\//.test(id)) return 'vendor-query'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
