import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'yanne_authed'
const VALID_PASSWORD = 'REDACTED_PASSWORD'

const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === 'true'
}
function notify() {
  listeners.forEach(cb => cb())
}

export function useAuth() {
  const authed = useSyncExternalStore(subscribe, getSnapshot)

  const login = useCallback((_email: string, password: string) => {
    if (password !== VALID_PASSWORD) throw new Error('Invalid password')
    localStorage.setItem(STORAGE_KEY, 'true')
    notify()
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    notify()
  }, [])

  return { authed, loading: false, login, logout }
}
