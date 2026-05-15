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

  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/api/organisations/me')
      setOrganisations(data?.organisations ?? [])
      setIsPlatformAdmin(data?.is_platform_admin ?? false)
    } catch {
      setOrganisations([])
      setIsPlatformAdmin(false)
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

  // Accepts a dept ID string or a { id, org_id } object.
  // Passing the full object lets the HQ-override check work even when the
  // caller has no direct membership in that department.
  const canInDept = (action, deptOrId) => {
    const deptId   = typeof deptOrId === 'string' ? deptOrId : deptOrId?.id
    const hintOrg  = typeof deptOrId === 'string' ? null     : deptOrId?.org_id
    const direct   = memberships.find(m => m.department.id === deptId)
    const orgId    = hintOrg ?? direct?.department.org_id
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
      isPlatformAdmin,
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
