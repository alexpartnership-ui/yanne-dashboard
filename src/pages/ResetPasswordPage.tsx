import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export function ResetPasswordPage() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (pw.length < 12) { setError('Minimum 12 characters'); return }
    if (pw !== pw2) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yanne-500 to-yanne-700 font-bold text-white text-sm tracking-tight shadow-sm">
            YC
          </div>
          <h1 className="text-lg font-semibold text-text-primary">Set new password</h1>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">New password</label>
          <input
            type="password"
            required
            value={pw}
            onChange={e => setPw(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-sm text-text-primary focus:border-yanne-500 focus:ring-1 focus:ring-yanne-500/20 focus:outline-none transition-all"
            placeholder="Minimum 12 characters"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Confirm password</label>
          <input
            type="password"
            required
            value={pw2}
            onChange={e => setPw2(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-sm text-text-primary focus:border-yanne-500 focus:ring-1 focus:ring-yanne-500/20 focus:outline-none transition-all"
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
          {loading ? 'Saving...' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
