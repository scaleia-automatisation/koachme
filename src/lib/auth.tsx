// Session utilisateur : état global de l'authentification et de l'assurance
// MFA (aal1 = mot de passe seul, aal2 = second facteur validé).
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { AuthContext, type Aal, type AuthState } from './use-auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [aal, setAal] = useState<{ currentLevel: Aal | null; nextLevel: Aal | null }>({ currentLevel: null, nextLevel: null })
  const [recovery, setRecovery] = useState(false)

  const refreshAal = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setAal({ currentLevel: (data?.currentLevel as Aal) ?? null, nextLevel: (data?.nextLevel as Aal) ?? null })
  }

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await refreshAal()
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') {
        setRecovery(false)
        setAal({ currentLevel: null, nextLevel: null })
        queryClient.clear()
      }
      // Appel différé : on évite d'appeler l'API Auth dans le callback lui-même.
      if (next && ['SIGNED_IN', 'TOKEN_REFRESHED', 'MFA_CHALLENGE_VERIFIED', 'USER_UPDATED'].includes(event)) {
        setTimeout(() => void refreshAal(), 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      currentLevel: aal.currentLevel,
      nextLevel: aal.nextLevel,
      recovery,
      refreshAal,
      signOut: async (scope = 'local') => {
        await supabase.auth.signOut({ scope })
      },
    }),
    [ready, session, aal, recovery],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
