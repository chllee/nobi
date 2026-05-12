import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchMembership(userId) {
    const { data } = await supabase
      .from('memberships')
      .select('role, organisations(id, name, slug)')
      .eq('user_id', userId)
      .single()

    setMembership(data ? { org: data.organisations, role: data.role } : null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) await fetchMembership(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) fetchMembership(session.user.id)
      else setMembership(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      org: membership?.org ?? null,
      role: membership?.role ?? null,
      loading,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
