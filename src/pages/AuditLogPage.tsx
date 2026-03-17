import { useState, useEffect } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useAuth } from '../hooks/useAuth'

interface AuditEntry {
  id: string
  user_id: string
  action: string
  resource: string
  details: Record<string, unknown>
  ip: string
  created_at: string
}

export function AuditLogPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch('/api/audit-log?limit=200')
        if (res.ok) setEntries(await res.json())
      } catch { /* silent */ }
      setLoading(false)
    }
    fetch()
  }, [])

  if (user?.role !== 'admin') {
    return <div className="text-center text-zinc-500 py-16">Admin access required</div>
  }

  const actionColors: Record<string, string> = {
    login: 'bg-emerald-100 text-emerald-700',
    login_failed: 'bg-red-100 text-red-700',
    logout: 'bg-zinc-100 text-zinc-700',
    export: 'bg-blue-100 text-blue-700',
    create_user: 'bg-purple-100 text-purple-700',
    delete_user: 'bg-red-100 text-red-700',
    update_targets: 'bg-amber-100 text-amber-700',
    update_client: 'bg-blue-100 text-blue-700',
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-zinc-900">Audit Log</h1>

      {loading ? (
        <div className="text-sm text-zinc-400">Loading...</div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Time</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Action</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Resource</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Details</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[e.action] || 'bg-zinc-100 text-zinc-700'}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{e.resource}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs max-w-xs truncate">
                    {Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-400">No audit entries</div>
          )}
        </div>
      )}
    </div>
  )
}
