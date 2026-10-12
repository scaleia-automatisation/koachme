// Fonctionnalités activables.
export const FEATURES = {
  /** Export PDF du bilan mensuel (impression du navigateur → « Enregistrer au format PDF »). */
  pdfExport: true,
  /** Rappel mensuel par email : nécessite un service d'envoi (Resend) configuré. */
  emailReminders: false,
} as const
