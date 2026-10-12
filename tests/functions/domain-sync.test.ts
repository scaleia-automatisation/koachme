// @vitest-environment node
// Le moteur copié dans les Edge Functions doit être identique à src/domain.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error module JavaScript sans types
import { domainFiles, transform } from '../../scripts/sync-domain.mjs'

describe('moteur partagé avec le serveur', () => {
  it('est à jour (sinon : node scripts/sync-domain.mjs)', () => {
    const dest = 'supabase/functions/_shared/domain'
    const files: string[] = domainFiles()
    expect(readdirSync(dest).sort()).toEqual([...files].sort())
    for (const f of files) {
      expect(existsSync(path.join(dest, f))).toBe(true)
      expect(readFileSync(path.join(dest, f), 'utf8')).toBe(transform(readFileSync(path.join('src/domain', f), 'utf8')))
    }
  })
})
