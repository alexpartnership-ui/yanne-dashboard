import { useEffect, useState } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useMondayOnboarding } from '../hooks/useMondayOnboarding'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'

interface OnboardedClient {
  id: string
  name: string
  companyName: string
  totalRaise: number
  date: string
  firstName: string
  lastName: string
}

function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s === 'done' || s === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (s === 'working on it' || s === 'in progress') return 'bg-blue-100 text-blue-700'
  if (s === 'stuck' || s === 'blocked') return 'bg-red-100 text-red-700'
  if (s === 'waiting' || s === 'pending') return 'bg-amber-100 text-amber-700'
  return 'bg-zinc-100 text-zinc-500'
}

export function OnboardingTrackerPage() {
  const { data: projects, loading: loadingP, error: errorP } = useMondayOnboarding()
  const [clients, setClients] = useState<OnboardedClient[]>([])
  const [loadingC, setLoadingC] = useState(true)
  const [newCompany, setNewCompany] = useState('')
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  useEffect(() => {
    apiFetch('/api/monday/onboarding-form')
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(d => setClients(d.clients || []))
      .finally(() => setLoadingC(false))
  }, [])

  async function createBoard() {
    if (!newCompany.trim()) return
    setCreating(true)
    try {
      const res = await apiFetch('/api/monday/create-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: newCompany.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Created board: ${data.boardName}`)
        setNewCompany('')
        window.location.reload()
      } else {
        toast.error(data.error || 'Failed to create board')
      }
    } catch {
      toast.error('Network error')
    }
    setCreating(false)
  }

  if (loadingP || loadingC) return <Spinner />

  const totalProjects = projects.length
  const avgCompletion = totalProjects > 0 ? Math.round(projects.reduce((s, p) => s + p.completionRate, 0) / totalProjects) : 0
  const totalTasks = projects.reduce((s, p) => s + p.tasks.length, 0)
  const doneTasks = projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length, 0)
  const stuckTasks = projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'Stuck' || t.status === 'Blocked').length, 0)
  const overdueTasks = projects.reduce((s, p) => s + p.tasks.filter(t => t.daysOverdue !== null && t.daysOverdue > 0).length, 0)

  // Recent onboarding form submissions
  const recentClients = [...clients].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Onboarding Tracker</h2>

      {errorP && <p className="mb-4 text-sm text-red-600">Error: {errorP}</p>}

      <div className="mb-6 grid grid-cols-7 gap-4">
        <MetricCard label="Active Projects" value={totalProjects} />
        <MetricCard label="Avg Completion" value={`${avgCompletion}%`} />
        <MetricCard label="Total Tasks" value={totalTasks} />
        <MetricCard label="Completed" value={doneTasks} />
        <MetricCard label="Stuck" value={stuckTasks} />
        <MetricCard label="Overdue" value={overdueTasks} subtitle={overdueTasks > 0 ? 'Needs attention' : 'On track'} />
        <MetricCard label="Onboarding Forms" value={clients.length} subtitle="All time" />
      </div>

      {/* Create new onboarding board */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm flex items-center gap-3">
        <input
          type="text"
          value={newCompany}
          onChange={e => setNewCompany(e.target.value)}
          placeholder="Company name..."
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-blue-400 focus:outline-none"
          onKeyDown={e => e.key === 'Enter' && createBoard()}
        />
        <button
          onClick={createBoard}
          disabled={creating || !newCompany.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Onboarding Board'}
        </button>
      </div>

      {/* Recent onboarding submissions */}
      {recentClients.length > 0 && (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Recent Onboarding Forms</h3>
          <div className="space-y-2">
            {recentClients.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium text-zinc-800">{c.companyName}</span>
                  <span className="text-xs text-zinc-400 ml-2">{c.firstName} {c.lastName}</span>
                </div>
                <div className="flex items-center gap-3">
                  {c.totalRaise > 0 && (
                    <span className="text-xs font-semibold text-zinc-600">${(c.totalRaise / 1000000).toFixed(1)}M</span>
                  )}
                  <span className="text-[10px] text-zinc-400">
                    {c.date ? new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-project cards */}
      <div className="space-y-4">
        {projects.map(project => (
          <div key={project.boardId} className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
              <div className="flex items-baseline gap-3">
                <h3 className="text-lg font-bold text-zinc-900">{project.name}</h3>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
                  {project.tasks.length} tasks
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${project.completionRate >= 80 ? 'bg-emerald-500' : project.completionRate >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    style={{ width: `${project.completionRate}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-zinc-700">{project.completionRate}%</span>
              </div>
            </div>

            <div className="px-5 py-3">
              <div className="grid grid-cols-5 gap-3">
                {project.groups.map(g => (
                  <div key={g.title} className="text-center">
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 truncate" title={g.title}>{g.title}</div>
                    <div className="text-sm font-bold text-zinc-800">{g.done}/{g.total}</div>
                    <div className="mt-1 h-1 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: g.total > 0 ? `${(g.done / g.total) * 100}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {project.tasks.filter(t => t.status && t.status !== 'Done' && t.status !== 'Completed' && t.status !== '').length > 0 && (
              <div className="px-5 pb-4">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Active Tasks</div>
                <div className="space-y-1">
                  {project.tasks
                    .filter(t => t.status && t.status !== 'Done' && t.status !== 'Completed' && t.status !== '')
                    .slice(0, 6)
                    .map(t => (
                      <div key={t.id} className="flex items-center justify-between py-1">
                        <span className="text-xs text-zinc-700 truncate max-w-[50%]">{t.name}</span>
                        <div className="flex items-center gap-1.5">
                          {t.daysOverdue !== null && t.daysOverdue > 0 && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{t.daysOverdue}d overdue</span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(t.status)}`}>{t.status}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
