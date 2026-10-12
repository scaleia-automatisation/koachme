// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findAccountLast4, redact } from '../../supabase/functions/_shared/redact.ts'

const HEADER = 'Titulaire : M. JEAN TEST     IBAN : FR76 3000 4000 5000 6000 7000 1234'

describe('findAccountLast4', () => {
  it('lit les 4 derniers chiffres de l’IBAN', () => {
    expect(findAccountLast4(HEADER)).toBe('1234')
    expect(findAccountLast4('IBAN FR7630004000500060007000987')).toBe('0987')
  })
  it('se rabat sur le numéro de compte', () => {
    expect(findAccountLast4('Compte n° 0123 4567 8901')).toBe('8901')
  })
  it('renvoie null sans identifiant', () => {
    expect(findAccountLast4('Relevé de compte courant')).toBeNull()
  })
})

describe('redact', () => {
  it('masque l’identité du titulaire et l’IBAN', () => {
    const out = redact(HEADER, null)
    expect(out).not.toMatch(/JEAN|TEST|FR76|3000|1234/)
    expect(out).toContain('[IBAN MASQUÉ]')
  })

  it('masque BIC, cartes, emails, téléphones et le prénom de l’utilisateur', () => {
    const out = redact('BIC : BNPAFRPPXXX carte 4974 1234 5678 9012 jean.test@mail.fr 06 12 34 56 78 bonjour Clémence', 'Clémence')
    expect(out).not.toMatch(/BNPAFRPP|4974|9012|jean\.test|06 12|Clémence/)
  })

  it('conserve les dates, libellés et montants des opérations', () => {
    const line = '28/01/2026 VIR SEPA RECU ACME SAS SALAIRE JANVIER 2 150,00'
    expect(redact(line, null)).toBe(line)
    const card = '03/01/2026 CB CARREFOUR MARKET 03/01 86,45'
    expect(redact(card, null)).toBe(card)
    const balance = 'SOLDE CREDITEUR AU 28/02/2026 2 460,50'
    expect(redact(balance, null)).toBe(balance)
  })

  it('masque les civilités en en-tête', () => {
    expect(redact('MME MARIE MARTIN', null)).toBe('[TITULAIRE MASQUÉ]')
    expect(redact('Monsieur Paul Durand\n12 rue des Lilas', null)).not.toMatch(/Paul|Durand/)
  })
})
