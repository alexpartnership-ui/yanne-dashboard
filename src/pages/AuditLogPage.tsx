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
    return <div className="text-center text-text-muted py-16">Admin access required</div>
  }

  const actionColors: Record<string, string> = {
    login: 'bg-emerald-100 text-emerald-700',
    login_failed: 'bg-red-100 text-red-700',
    logout: 'bg-surface-overlay text-text-secondary',
    export: 'bg-blue-100 text-blue-700',
    create_user: 'bg-purple-100 text-purple-700',
    delete_user: 'bg-red-100 text-red-700',
    update_targets: 'bg-amber-100 text-amber-700',
    update_client: 'bg-blue-100 text-blue-700',
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Audit Log</h1>

      {loading ? (
        <div className="text-sm text-text-faint">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-muted bg-surface-raised">
                <th className="px-4 py-3 text-left font-medium text-text-muted">Time</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Action</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Resource</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Details</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-border-muted last:border-0">
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[e.action] || 'bg-surface-overlay text-text-secondary'}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{e.resource}</td>
                  <td className="px-4 py-3 text-text-muted text-xs max-w-xs truncate">
                    {Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : '—'}
                  </td>
                  <td className="px-4 py-3 text-text-faint text-xs">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && (
            <div className="py-8 text-center text-sm text-text-faint">No audit entries</div>
          )}
        </div>
      )}
    </div>
  )
}
