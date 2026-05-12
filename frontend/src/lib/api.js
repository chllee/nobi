import { supabase } from './supabase'

async function authHeaders() {
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
