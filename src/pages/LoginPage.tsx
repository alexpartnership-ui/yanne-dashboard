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
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Yanne Capital</h1>
        <p className="mt-1 text-sm text-zinc-500">Sales Intelligence Dashboard</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
