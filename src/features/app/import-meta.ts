// Libellés liés aux imports de relevés.

export const IMPORT_ERRORS: Record<string, { title: string; advice: string; retryable: boolean }> = {
  not_pdf: { title: 'Ce fichier n’est pas un PDF valide.', advice: 'Téléchargez à nouveau le relevé au format PDF depuis votre banque en ligne.', retryable: false },
  encrypted: { title: 'Ce PDF est protégé par un mot de passe.', advice: 'Téléchargez une version non protégée depuis votre banque, ou enregistrez-le sans mot de passe.', retryable: false },
  needs_ocr: {
    title: 'Ce relevé est un document scanné.',
    advice: 'Son texte n’est pas directement lisible. Nous pouvons le lire par reconnaissance de caractères (OCR) avec votre accord.',
    retryable: false,
  },
  unsupported_currency: { title: 'Ce relevé n’est pas en euros.', advice: 'Seuls les comptes en euros sont pris en charge pour le moment.', retryable: false },
  unreadable: {
    title: 'Le texte de ce relevé n’est pas lisible.',
    advice: 'Il s’agit probablement d’un scan ou d’une photo. Téléchargez le relevé directement depuis votre banque en ligne.',
    retryable: false,
  },
  too_long: { title: 'Ce document est trop long (40 pages maximum).', advice: 'Importez vos relevés mois par mois.', retryable: false },
  not_statement: { title: 'Ce document ne ressemble pas à un relevé de compte.', advice: 'Vérifiez qu’il s’agit bien d’un relevé bancaire listant vos opérations.', retryable: false },
  no_operations: { title: 'Aucune opération n’a été trouvée.', advice: 'Vérifiez que le relevé contient des opérations sur la période.', retryable: true },
  processing_error: { title: 'L’analyse n’a pas pu aboutir.', advice: 'Il peut s’agir d’un incident temporaire. Réessayez dans quelques instants.', retryable: true },
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** Date courte (AAAA-MM-JJ, lue en date locale) ou horodatage complet (factures, abonnements). */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso))
}

export function formatPeriod(start: string, end: string): string {
  return `du ${formatDate(start)} au ${formatDate(end)}`
}

/** « 2026-01 » → « janvier 2026 » (ou « janv. 26 » en version courte). */
export function monthLabel(month: string, style: 'short' | 'long' = 'long'): string {
  return new Intl.DateTimeFormat('fr-FR', { month: style, year: style === 'long' ? 'numeric' : '2-digit' }).format(new Date(`${month}-01T00:00:00`))
}

/** « Bilan d’octobre 2026 », « Bilan de mars 2026 » (élision devant une voyelle). */
export function reportTitle(month: string): string {
  const label = monthLabel(month)
  return /^[aeiouy]/i.test(label) ? `Bilan d’${label}` : `Bilan de ${label}`
}
