import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { authed, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (authed) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yanne-500 to-yanne-700 font-bold text-white text-sm tracking-tight shadow-sm">
            YC
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary leading-tight tracking-tight">Yanne Capital</h1>
            <p className="text-[10px] text-gold-500 uppercase tracking-[0.14em] font-data">Intelligence Platform</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:border-yanne-500 focus:ring-1 focus:ring-yanne-500/20 focus:outline-none transition-all"
              placeholder="alex@yannetr.net"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:border-yanne-500 focus:ring-1 focus:ring-yanne-500/20 focus:outline-none transition-all"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-yanne-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-yanne-400 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
