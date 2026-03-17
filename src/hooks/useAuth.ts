import { useCallback, useSyncExternalStore } from 'react'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'rep' | 'finance'
}

interface AuthState {
  user: User | null
  loading: boolean
}

const STORAGE_KEY = 'yanne_user'
let authState: AuthState = {
  user: (() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })(),
  loading: false,
}

const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot() {
  return authState
}
function notify() {
  listeners.forEach(cb => cb())
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  if (res.status === 401) {
    authState = { user: null, loading: false }
    localStorage.removeItem(STORAGE_KEY)
    notify()
    throw new Error('Session expired')
  }
  return res
}

export { apiFetch }

export function useAuth() {
  const state = useSyncExternalStore(subscribe, getSnapshot)

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Invalid credentials')
    }
    const data = await res.json()
    authState = { user: data.user, loading: false }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user))
    notify()
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    authState = { user: null, loading: false }
    localStorage.removeItem(STORAGE_KEY)
    notify()
  }, [])

  return {
    authed: !!state.user,
    user: state.user,
    loading: state.loading,
    login,
    logout,
  }
}
