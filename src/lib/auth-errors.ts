// Traduction des erreurs d'authentification Supabase en messages clairs.
import { AuthError } from '@supabase/supabase-js'

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Votre adresse email n’est pas encore confirmée. Consultez l’email que nous vous avons envoyé.',
  user_already_exists: 'Un compte existe déjà avec cette adresse email.',
  email_exists: 'Un compte existe déjà avec cette adresse email.',
  weak_password: 'Mot de passe trop faible : 8 caractères minimum, avec des lettres et au moins un chiffre.',
  same_password: 'Le nouveau mot de passe doit être différent de l’ancien.',
  over_email_send_rate_limit: 'Trop d’emails envoyés récemment. Patientez quelques minutes avant de réessayer.',
  over_request_rate_limit: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  email_address_invalid: 'Cette adresse email n’est pas valide.',
  otp_expired: 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.',
  mfa_verification_failed: 'Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.',
  mfa_challenge_expired: 'Le code a expiré. Saisissez le code actuellement affiché.',
  session_not_found: 'Votre session a expiré. Reconnectez-vous.',
  reauthentication_needed: 'Pour des raisons de sécurité, reconnectez-vous avant cette opération.',
  signup_disabled: 'Les inscriptions sont momentanément fermées.',
  email_address_not_authorized: 'L’email de confirmation ne peut pas être envoyé pour le moment. Réessayez plus tard ou contactez l’assistance.',
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError && error.code && BY_CODE[error.code]) return BY_CODE[error.code]
  if (error instanceof Error && /fetch|network/i.test(error.message)) return 'Connexion impossible. Vérifiez votre accès à internet.'
  return 'Une erreur est survenue. Réessayez dans quelques instants.'
}

/** Règle de mot de passe, identique à la configuration Supabase Auth. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return '8 caractères minimum'
  if (!/[a-zA-Z]/.test(password)) return 'Ajoutez au moins une lettre'
  if (!/\d/.test(password)) return 'Ajoutez au moins un chiffre'
  return null
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
