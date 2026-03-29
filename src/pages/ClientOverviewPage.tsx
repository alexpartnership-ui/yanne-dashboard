import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useAuth'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

interface OnboardedClient {
  id: string
  name: string
  companyName: string
  totalRaise: number
  date: string
  firstName: string
  lastName: string
  email: string
  hq: string
}

interface BisonWorkspace {
  id: number
  name: string
}

export function ClientOverviewPage() {
  const [clients, setClients] = useState<OnboardedClient[]>([])
  const [workspaces, setWorkspaces] = useState<BisonWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      apiFetch('/api/monday/onboarding-form').then(r => r.ok ? r.json() : { clients: [] }),
      apiFetch('/api/bison/workspaces').then(r => r.ok ? r.json() : []),
    ]).then(([mondayData, bisonData]) => {
      setClients(mondayData.clients || [])
      const ws = Array.isArray(bisonData) ? bisonData : bisonData.data || bisonData.workspaces || []
      setWorkspaces(ws.filter((w: BisonWorkspace) => w.name && w.name.toLowerCase().includes('project')))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  // Match clients to Bison workspaces (active = has a workspace)
  const activeNames = new Set(workspaces.map(w => w.name.replace(/^Project\s*[-–]?\s*/i, '').trim().toLowerCase()))

  const enrichedClients = clients.map(c => {
    const nameLower = c.companyName.toLowerCase()
    const isActive = activeNames.has(nameLower) || [...activeNames].some(a => nameLower.includes(a) || a.includes(nameLower))
    const matchedWs = workspaces.find(w => {
      const wsName = w.name.replace(/^Project\s*[-–]?\s*/i, '').trim().toLowerCase()
      return nameLower.includes(wsName) || wsName.includes(nameLower)
    })
    return { ...c, isActive, bisonWorkspaceId: matchedWs?.id ?? null, bisonWorkspaceName: matchedWs?.name ?? null }
  }).sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const activeCount = enrichedClients.filter(c => c.isActive).length
  const totalRaiseTarget = enrichedClients.reduce((s, c) => s + c.totalRaise, 0)

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-text-primary">Client Overview</h2>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard label="Total Clients" value={clients.length} subtitle="From onboarding form" />
        <MetricCard label="Active (Bison)" value={activeCount} subtitle="Have campaign workspace" />
        <MetricCard label="Bison Workspaces" value={workspaces.length} />
        <MetricCard label="Total Raise Target" value={`$${(totalRaiseTarget / 1000000).toFixed(0)}M`} />
      </div>

      <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-raised">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              <th className="text-left px-4 py-3">Company</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">HQ</th>
              <th className="text-right px-4 py-3">Raise Target</th>
              <th className="text-left px-4 py-3">Onboarded</th>
              <th className="text-center px-4 py-3">Campaign Status</th>
              <th className="text-center px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {enrichedClients.map(c => (
              <tr key={c.id} className="hover:bg-surface-raised transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{c.companyName}</td>
                <td className="px-4 py-3 text-xs text-text-muted">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-xs text-text-muted">{c.hq || '\u2014'}</td>
                <td className="px-4 py-3 text-xs text-text-secondary text-right font-semibold">
                  {c.totalRaise > 0 ? `$${(c.totalRaise / 1000000).toFixed(1)}M` : '\u2014'}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {c.date ? new Date(c.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '\u2014'}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.isActive ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
                  ) : (
                    <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 text-[10px] font-semibold text-text-muted">No workspace</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.isActive && (
                    <button
                      onClick={() => navigate(`/clients/campaigns?client=${encodeURIComponent(c.bisonWorkspaceName || c.companyName)}`)}
                      className="rounded bg-yanne/10 px-2 py-1 text-[10px] font-semibold text-yanne hover:bg-yanne/20 transition-colors"
                    >
                      View Campaigns
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
