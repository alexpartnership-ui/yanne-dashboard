import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'member'
  pillar_access: string[]
}

interface AuthState { user: User | null; loading: boolean }

async function apiFetch(url: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const res = await fetch(url, { ...opts, headers })
  if (res.status === 401) {
    await supabase.auth.signOut()
    throw new Error('Session expired')
  }
  return res
}

export { apiFetch }

async function fetchProfile(): Promise<User | null> {
  try {
    const res = await apiFetch('/api/auth/me')
    if (!res.ok) return null
    const { user } = await res.json()
    return user
  } catch { return null }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setState({ user: session ? await fetchProfile() : null, loading: false })
    })()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!mounted) return
      setState({ user: session ? await fetchProfile() : null, loading: false })
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }, [])

  const logout = useCallback(async () => { await supabase.auth.signOut() }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  }, [])

  return { authed: !!state.user, user: state.user, loading: state.loading, login, logout, resetPassword }
}
