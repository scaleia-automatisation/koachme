import type { User, Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type Aal = 'aal1' | 'aal2'

export interface AuthState {
  /** false tant que la session initiale n'est pas connue. */
  ready: boolean
  session: Session | null
  user: User | null
  currentLevel: Aal | null
  /** aal2 si l'utilisateur a activé un second facteur. */
  nextLevel: Aal | null
  /** Vrai après un clic sur un lien de réinitialisation de mot de passe. */
  recovery: boolean
  refreshAal: () => Promise<void>
  signOut: (scope?: 'local' | 'global') => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}

/** L'utilisateur doit-il encore saisir son code MFA ? */
export function needsMfa(state: Pick<AuthState, 'currentLevel' | 'nextLevel'>): boolean {
  return state.nextLevel === 'aal2' && state.currentLevel !== 'aal2'
}
