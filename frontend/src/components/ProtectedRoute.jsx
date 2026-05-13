import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

// Inserted between ProtectedRoute and AppShell — sends users with no org to onboarding.
export function MembershipGuard() {
  const { organisations, memberships, loading } = useAuth()
  if (loading || organisations === null) return null
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
