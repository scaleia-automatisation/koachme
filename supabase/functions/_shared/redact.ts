// Masquage des données d'identification d'un relevé avant tout envoi à un
// service tiers (LLM). Les montants, dates et libellés d'opérations sont
// conservés ; IBAN, numéros de compte/carte, coordonnées et identité du
// titulaire sont remplacés.

const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g

/** 4 derniers chiffres du compte (IBAN ou numéro de compte), lus avant masquage. */
export function findAccountLast4(text: string): string | null {
  const iban = text.toUpperCase().match(IBAN_RE)?.[0]
  if (iban) return iban.replace(/\s/g, '').slice(-4)
  const account = text.match(/(?:compte|account)\s*(?:n[°o]|num[ée]ro)?\s*:?\s*(\d[\d ]{7,})/i)?.[1]?.replace(/\s/g, '')
  return account && account.length >= 8 ? account.slice(-4) : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redact(text: string, displayName: string | null): string {
  let out = text
    .replace(IBAN_RE, '[IBAN MASQUÉ]')
    .replace(/\b(?:BIC|SWIFT)\s*:?\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi, 'BIC [MASQUÉ]')
    // Numéros de carte (13 à 19 chiffres, éventuellement groupés) et longs identifiants.
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, '[NUMÉRO MASQUÉ]')
    .replace(/\b\d{9,}\b/g, '[NUMÉRO MASQUÉ]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL MASQUÉ]')
    .replace(/(?:\+33\s?|\b0)[1-9](?:[ .-]?\d{2}){4}\b/g, '[TÉLÉPHONE MASQUÉ]')

  // Identité du titulaire : « Titulaire : M. JEAN DUPONT », « MME MARIE MARTIN »…
  out = out.replace(
    /\b(?:titulaire\s*:?\s*)?(?:m\.|mr|mme|mlle|monsieur|madame)\s+[A-ZÀ-Ü][A-ZÀ-Ü' -]{1,60}?(?=\s{2,}|\s*\[|\s*$|\s+(?:IBAN|BIC|N°|Compte)\b)/gim,
    '[TITULAIRE MASQUÉ]',
  )
  out = out.replace(/\btitulaire(?!\s+masqu)\s*:?\s*[^\n[]{2,60}?(?=\s{2,}|\s*\[|$)/gim, 'Titulaire : [MASQUÉ]')

  if (displayName && displayName.trim().length >= 3) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(displayName.trim())}\\b`, 'gi'), '[NOM MASQUÉ]')
  }
  return out
}
