import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch, setAuthToken } from '../lib/api'

const AuthContext = createContext(null)

const ROLE_DEFAULTS = {
  admin: ['view', 'upload', 'edit', 'delete', 'manage_members', 'manage_departments'],
  editor: ['view', 'upload', 'edit'],
  viewer: ['view'],
}

function permsFor(role, extra) {
  return new Set([...(ROLE_DEFAULTS[role] || []), ...(extra || [])])
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [organisations, setOrganisations] = useState(null) // null = not yet fetched
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/api/organisations/me')
      setOrganisations(data?.organisations ?? [])
    } catch {
      setOrganisations([])
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setAuthToken(session?.access_token ?? null)
      setSession(session)
      if (session) await refresh()
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setAuthToken(newSession?.access_token ?? null)
      setSession(newSession)
      if (newSession) await refresh()
      else setOrganisations([])
    })

    return () => subscription.unsubscribe()
  }, [refresh])

  async function signOut() { await supabase.auth.signOut() }

  // Flatten memberships across all orgs for quick lookup.
  const memberships = (organisations || []).flatMap(o =>
    (o.memberships || []).map(m => ({ ...m, org: { id: o.id, name: o.name } }))
  )

  const canInDept = (action, deptId) => {
    const direct = memberships.find(m => m.department.id === deptId)
    const orgId = direct?.department.org_id
    if (orgId) {
      const hq = memberships.find(m => m.department.is_hq && m.department.org_id === orgId)
      if (hq && permsFor(hq.role, hq.extra_permissions).has(action)) return true
    }
    if (direct && permsFor(direct.role, direct.extra_permissions).has(action)) return true
    return false
  }

  const canInOrg = (action, orgId) => {
    const hq = memberships.find(m => m.department.is_hq && m.department.org_id === orgId)
    return !!hq && permsFor(hq.role, hq.extra_permissions).has(action)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      organisations,
      memberships,
      loading,
      signOut,
      refresh,
      canInDept,
      canInOrg,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
