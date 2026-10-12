// Informations légales de l'éditeur, centralisées pour toutes les pages.
// ⚠ Les champs marqués TO_COMPLETE doivent être renseignés avant la mise en
// production (immatriculation, adresse, hébergeur définitif).

export const TO_COMPLETE = '[à compléter avant mise en ligne]'

export const LEGAL = {
  productName: 'Economiz',
  companyName: TO_COMPLETE,
  legalForm: TO_COMPLETE,
  shareCapital: TO_COMPLETE,
  registration: TO_COMPLETE,
  vatNumber: TO_COMPLETE,
  address: TO_COMPLETE,
  publicationDirector: TO_COMPLETE,
  contactEmail: TO_COMPLETE,
  dpoEmail: TO_COMPLETE,
  frontendHost: TO_COMPLETE,
  dataHost: 'Supabase Inc. — base de données et fichiers hébergés à Francfort (Allemagne, Union européenne)',
  mediator: TO_COMPLETE,
} as const

/** Version en vigueur des CGU et de la politique de confidentialité. */
export const TERMS_VERSION = '2026-10-12'
export const TERMS_UPDATED_AT = '12 octobre 2026'

/** Sous-traitants intervenant dans le traitement des données. */
export const PROCESSORS = [
  { name: 'Supabase', purpose: 'Hébergement de la base de données, authentification et stockage des relevés', location: 'Union européenne' },
  { name: 'OpenAI', purpose: 'Lecture des relevés importés et coach IA (identité, IBAN, numéros et coordonnées masqués avant transmission, sauf relevé scanné lu par OCR avec votre accord ; données non utilisées pour l’entraînement)', location: 'États-Unis (clauses contractuelles types)' },
  { name: 'Stripe', purpose: 'Paiement et gestion des abonnements', location: 'Union européenne / États-Unis (clauses contractuelles types)' },
  { name: 'Resend', purpose: 'Envoi des emails transactionnels', location: 'États-Unis (clauses contractuelles types)' },
] as const
