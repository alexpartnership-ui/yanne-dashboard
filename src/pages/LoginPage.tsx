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
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-yanne-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-gold-400/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Card */}
        <div className="rounded-2xl border border-border bg-surface-raised/80 backdrop-blur-xl p-8 shadow-2xl shadow-black/40">
          {/* Top glow line */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-yanne-400/40 to-transparent" />

          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yanne-500 to-yanne-700 font-bold text-white text-sm tracking-tight shadow-lg shadow-yanne-900/50 ring-1 ring-yanne-400/20">
              YC
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary leading-tight tracking-tight">Yanne Capital</h1>
              <p className="text-[10px] text-gold-400 uppercase tracking-[0.16em] font-data">Intelligence Platform</p>
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
                className="block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:border-yanne-500 focus:ring-1 focus:ring-yanne-500/30 focus:outline-none transition-all"
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
                className="block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:border-yanne-500 focus:ring-1 focus:ring-yanne-500/30 focus:outline-none transition-all"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-negative/10 border border-negative/20 px-3 py-2">
                <p className="text-sm text-negative">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-yanne-600 to-yanne-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-yanne-500 hover:to-yanne-400 transition-all disabled:opacity-50 shadow-lg shadow-yanne-900/30"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Bottom text */}
        <p className="text-center text-[10px] text-text-faint mt-4 font-data tracking-wider">
          SEC-REGISTERED INVESTMENT BANK
        </p>
      </div>
    </div>
  )
}
