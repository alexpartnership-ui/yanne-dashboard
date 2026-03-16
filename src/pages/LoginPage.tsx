import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { authed, login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (authed) return <Navigate to="/calls" replace />

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      login('', password)
    } catch {
      setError('Invalid password')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-yanne-bg">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yanne font-bold text-white text-sm">
            YC
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 leading-tight">Yanne Capital</h1>
            <p className="text-xs text-zinc-500">Sales Intelligence Dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-yanne focus:outline-none"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-yanne px-4 py-2 text-sm font-medium text-white hover:bg-yanne/90 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
