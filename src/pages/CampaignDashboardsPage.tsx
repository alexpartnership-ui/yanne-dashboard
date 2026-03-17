import { useBisonCampaigns } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

function statusBadge(status: string): { color: string; label: string } {
  switch (status) {
    case 'active': return { color: 'bg-emerald-100 text-emerald-700', label: 'Active' }
    case 'launching': return { color: 'bg-blue-100 text-blue-700', label: 'Launching' }
    case 'completed': return { color: 'bg-zinc-100 text-zinc-600', label: 'Completed' }
    case 'paused': return { color: 'bg-amber-100 text-amber-700', label: 'Paused' }
    case 'stopped': return { color: 'bg-red-100 text-red-700', label: 'Stopped' }
    default: return { color: 'bg-zinc-100 text-zinc-500', label: status }
  }
}

export function CampaignDashboardsPage() {
  const { data, loading, error } = useBisonCampaigns()

  if (loading) return <Spinner />

  if (error && error.includes('not configured')) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-zinc-900">Campaign Dashboards</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20">
          <p className="text-sm text-zinc-500">EmailBison API key not configured</p>
          <p className="text-xs text-zinc-400 mt-1">Add EMAILBISON_API_KEY to environment variables</p>
        </div>
      </div>
    )
  }

  const campaigns = data?.campaigns ?? []
  const t = data?.totals

  // Group by status
  const active = campaigns.filter(c => c.status === 'active' || c.status === 'launching')
  const completed = campaigns.filter(c => c.status === 'completed')
  const other = campaigns.filter(c => !['active', 'launching', 'completed'].includes(c.status))

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Campaign Dashboards</h2>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-6 gap-4">
        <MetricCard label="Total Campaigns" value={t?.totalCampaigns ?? 0} />
        <MetricCard label="Active" value={t?.activeCampaigns ?? 0} />
        <MetricCard label="Emails Sent" value={(t?.totalSent ?? 0).toLocaleString()} />
        <MetricCard label="Total Replies" value={t?.totalReplies ?? 0} />
        <MetricCard label="Avg Reply Rate" value={`${t?.avgReplyRate ?? 0}%`} />
        <MetricCard label="Avg Bounce Rate" value={`${t?.avgBounceRate ?? 0}%`} />
      </div>

      {/* Active campaigns */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">Active Campaigns ({active.length})</h3>
        <div className="grid grid-cols-3 gap-3">
          {active.map(c => {
            const s = c.statistics
            return (
              <div key={c.id} className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-800 leading-tight max-w-[80%]">{c.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusBadge(c.status).color}`}>
                    {statusBadge(c.status).label}
                  </span>
                </div>
                {s && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div>
                      <div className="text-lg font-bold text-zinc-900">{s.emails_sent?.toLocaleString()}</div>
                      <div className="text-[9px] text-zinc-400">Sent</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${(s.reply_rate ?? 0) > 3 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {s.reply_rate?.toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-zinc-400">Reply</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${(s.bounce_rate ?? 0) > 3 ? 'text-red-600' : 'text-zinc-600'}`}>
                        {s.bounce_rate?.toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-zinc-400">Bounce</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Completed + other */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Completed ({completed.length})</h3>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {completed.map(c => (
              <div key={c.id} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-zinc-700 truncate max-w-[55%]">{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400">{c.statistics?.emails_sent?.toLocaleString()} sent</span>
                  <span className={`text-[10px] font-semibold ${(c.statistics?.reply_rate ?? 0) > 3 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                    {c.statistics?.reply_rate?.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Paused / Stopped ({other.length})</h3>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {other.map(c => (
              <div key={c.id} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-zinc-700 truncate max-w-[55%]">{c.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusBadge(c.status).color}`}>
                  {statusBadge(c.status).label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
