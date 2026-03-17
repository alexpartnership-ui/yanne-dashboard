import { useMondayOnboarding } from '../hooks/useMondayOnboarding'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s === 'done' || s === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (s === 'working on it' || s === 'in progress') return 'bg-blue-100 text-blue-700'
  if (s === 'stuck' || s === 'blocked') return 'bg-red-100 text-red-700'
  if (s === 'waiting' || s === 'pending') return 'bg-amber-100 text-amber-700'
  return 'bg-zinc-100 text-zinc-500'
}

export function OnboardingTrackerPage() {
  const { data: projects, loading, error } = useMondayOnboarding()

  if (loading) return <Spinner />

  if (error && error.includes('not configured')) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-zinc-900">Onboarding Tracker</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20">
          <p className="text-sm text-zinc-500">Monday.com API key not configured</p>
          <p className="text-xs text-zinc-400 mt-1">Add MONDAY_API_KEY to environment variables</p>
        </div>
      </div>
    )
  }

  const totalProjects = projects.length
  const avgCompletion = totalProjects > 0 ? Math.round(projects.reduce((s, p) => s + p.completionRate, 0) / totalProjects) : 0
  const totalTasks = projects.reduce((s, p) => s + p.tasks.length, 0)
  const doneTasks = projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length, 0)
  const stuckTasks = projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'Stuck' || t.status === 'Blocked').length, 0)

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Onboarding Tracker</h2>

      {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Active Projects" value={totalProjects} />
        <MetricCard label="Avg Completion" value={`${avgCompletion}%`} />
        <MetricCard label="Total Tasks" value={totalTasks} />
        <MetricCard label="Completed" value={doneTasks} />
        <MetricCard label="Stuck / Blocked" value={stuckTasks} />
      </div>

      {/* Per-project cards */}
      <div className="space-y-4">
        {projects.map(project => (
          <div key={project.boardId} className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            {/* Project header */}
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

            {/* Group progress bars */}
            <div className="px-5 py-3">
              <div className="grid grid-cols-5 gap-3">
                {project.groups.map(g => (
                  <div key={g.title} className="text-center">
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1 truncate" title={g.title}>
                      {g.title}
                    </div>
                    <div className="text-sm font-bold text-zinc-800">
                      {g.done}/{g.total}
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: g.total > 0 ? `${(g.done / g.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stuck/in-progress tasks only */}
            {project.tasks.filter(t => t.status && t.status !== 'Done' && t.status !== 'Completed' && t.status !== '').length > 0 && (
              <div className="px-5 pb-4">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">Active Tasks</div>
                <div className="space-y-1">
                  {project.tasks
                    .filter(t => t.status && t.status !== 'Done' && t.status !== 'Completed' && t.status !== '')
                    .slice(0, 6)
                    .map(t => (
                      <div key={t.id} className="flex items-center justify-between py-1">
                        <span className="text-xs text-zinc-700 truncate max-w-[60%]">{t.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(t.status)}`}>
                          {t.status}
                        </span>
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
