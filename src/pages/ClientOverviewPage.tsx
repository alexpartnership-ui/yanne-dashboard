import { useMondayProjects } from '../hooks/useMondayProjects'
import { useHubSpotDeals } from '../hooks/useHubSpotDeals'
import { useBisonCampaigns } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

function ragColor(health: string): string {
  const h = health.toLowerCase()
  if (h.includes('green') || h === 'on track') return 'bg-emerald-100 text-emerald-700'
  if (h.includes('yellow') || h === 'at risk') return 'bg-amber-100 text-amber-700'
  if (h.includes('red') || h === 'critical') return 'bg-red-100 text-red-700'
  return 'bg-zinc-100 text-zinc-500'
}

function stageColor(stage: string): string {
  const s = stage.toLowerCase()
  if (s.includes('active') || s.includes('execution')) return 'bg-emerald-100 text-emerald-700'
  if (s.includes('upcoming')) return 'bg-blue-100 text-blue-700'
  if (s.includes('done') || s.includes('completed')) return 'bg-zinc-100 text-zinc-500'
  return 'bg-zinc-100 text-zinc-500'
}

export function ClientOverviewPage() {
  const { data: projects, loading: loadingP, error: errorP } = useMondayProjects()
  const { data: hubspot, loading: loadingH, error: errorH } = useHubSpotDeals()
  const { data: bison, loading: loadingB } = useBisonCampaigns()

  if (loadingP || loadingH || loadingB) return <Spinner />

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Client Overview</h2>

      {(errorP || errorH) && (
        <p className="mb-4 text-sm text-amber-600">Some data sources unavailable: {errorP || errorH}</p>
      )}

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Active Projects" value={projects.length} subtitle="Monday.com" />
        <MetricCard label="HubSpot Deals" value={hubspot?.deals.length ?? 0} subtitle={`${hubspot?.wonCount ?? 0} won`} />
        <MetricCard label="Pipeline Value" value={hubspot?.totalValue ? `$${(hubspot.totalValue / 1000).toFixed(0)}K` : '$0'} />
        <MetricCard label="Active Campaigns" value={bison?.totals.activeCampaigns ?? 0} subtitle="EmailBison" />
        <MetricCard label="Close Rate" value={hubspot && hubspot.deals.length > 0 ? `${Math.round((hubspot.wonCount / hubspot.deals.length) * 100)}%` : '—'} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Monday.com Projects */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-4">Client Projects (Monday.com)</h3>
          {projects.length === 0 ? (
            <p className="text-xs text-zinc-400">No projects found</p>
          ) : (
            <div className="space-y-2">
              {projects.map(p => (
                <div key={p.boardId} className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-zinc-800">{p.name}</span>
                    {p.owner && <span className="text-xs text-zinc-400 ml-2">{p.owner}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stageColor(p.stage)}`}>
                      {p.stage || 'Unknown'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ragColor(p.health)}`}>
                      {p.health || 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HubSpot Pipeline */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-4">HubSpot Pipeline</h3>
          {!hubspot || hubspot.deals.length === 0 ? (
            <p className="text-xs text-zinc-400">No HubSpot deals found</p>
          ) : (
            <>
              {/* Stage breakdown */}
              <div className="space-y-2 mb-4">
                {Object.entries(hubspot.stageBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => {
                    const pct = (count / hubspot.deals.length) * 100
                    return (
                      <div key={stage}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-zinc-600">{stage}</span>
                          <span className="font-semibold text-zinc-800">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                          <div className="h-full rounded-full bg-yanne transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>

              {/* Recent deals */}
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 pt-3 border-t border-zinc-100">Recent Deals</h4>
              <div className="space-y-1">
                {hubspot.deals.slice(0, 8).map(d => (
                  <div key={d.id} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-zinc-700 truncate max-w-[60%]">{d.name}</span>
                    <span className="text-[10px] text-zinc-400">{d.stageName}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
