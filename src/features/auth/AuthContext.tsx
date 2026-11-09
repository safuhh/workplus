/**
 * AuthProvider — provides the current Supabase session and user throughout the app.
 * Handles session restoration on mount and listens for auth state changes.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
        setSession(newSession)
        setLoading(false)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
