/** Destination après connexion : uniquement un chemin interne à l'espace personnel. */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/app') && !value.startsWith('//') ? value : '/app'
}
