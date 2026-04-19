import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'member'
  pillar_access: string[]
}

const STORAGE_KEY = 'sb-ewmqiwunzqpyhdjowiyn-auth-token'

function readLocalToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const session = parsed.access_token ? parsed : parsed.currentSession
    if (!session?.access_token) return null
    if (session.expires_at && session.expires_at * 1000 < Date.now()) return null
    return session.access_token
  } catch { return null }
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const token = readLocalToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...opts, headers })
  if (res.status === 401) {
    try { await supabase.auth.signOut() } catch { /* ignore */ }
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

interface AuthState { user: User | null; loading: boolean }

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    loading: readLocalToken() !== null,
  }))

  useEffect(() => {
    let mounted = true

    if (readLocalToken()) {
      fetchProfile().then(user => {
        if (!mounted) return
        setState({ user, loading: false })
      })
    } else {
      setState({ user: null, loading: false })
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT' || !session) {
        setState({ user: null, loading: false })
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const user = await fetchProfile()
        if (!mounted) return
        setState({ user, loading: false })
      }
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await Promise.race([
      supabase.auth.signInWithPassword({ email, password }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Sign-in timed out — check your network')), 15000)),
    ])
    if (result.error) throw new Error(result.error.message)
  }, [])

  const logout = useCallback(async () => {
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise<void>(res => setTimeout(res, 3000)),
      ])
    } catch { /* ignore */ }
    // Clear local session regardless so UI transitions out
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setState({ user: null, loading: false })
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  }, [])

  return { authed: !!state.user, user: state.user, loading: state.loading, login, logout, resetPassword }
}
