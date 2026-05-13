import { supabase } from './supabase'

// Cached token — updated by AuthContext so authHeaders() never calls getSession()
// from inside an onAuthStateChange callback, which deadlocks the Supabase session lock.
let _token = null
export function setAuthToken(token) { _token = token }

async function authHeaders() {
  if (_token) return { Authorization: `Bearer ${_token}` }
  // Fallback for callers outside of React (e.g. smoke tests hitting the API directly).
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export async function apiFetch(path, options = {}) {
  const headers = { ...await authHeaders(), ...options.headers }
  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}
