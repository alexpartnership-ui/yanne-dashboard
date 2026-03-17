import { useBisonCampaigns } from '../hooks/useBisonCampaigns'
import { useBisonReplies } from '../hooks/useBisonReplies'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

function rateColor(rate: number, thresholds: [number, number] = [2, 5]): string {
  if (rate >= thresholds[1]) return 'text-emerald-600'
  if (rate >= thresholds[0]) return 'text-amber-600'
  return 'text-red-600'
}

export function EmailIntelligencePage() {
  const { data: campaigns, loading: loadingC, error: errorC } = useBisonCampaigns()
  const { data: replies, loading: loadingR, error: errorR } = useBisonReplies()

  if (loadingC || loadingR) return <Spinner />

  const apiError = errorC || errorR
  if (apiError && apiError.includes('not configured')) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-zinc-900">Email Intelligence</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20">
          <p className="text-sm text-zinc-500">EmailBison API key not configured</p>
          <p className="text-xs text-zinc-400 mt-1">Add EMAILBISON_API_KEY to environment variables</p>
        </div>
      </div>
    )
  }

  const t = campaigns?.totals
  const r = replies?.totals

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Email Intelligence</h2>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Campaigns" value={t?.totalCampaigns ?? 0} subtitle={`${t?.activeCampaigns ?? 0} active`} />
        <MetricCard label="Emails Sent" value={(t?.totalSent ?? 0).toLocaleString()} />
        <MetricCard label="Avg Reply Rate" value={`${t?.avgReplyRate ?? 0}%`} />
        <MetricCard label="Total Replies" value={t?.totalReplies ?? 0} />
        <MetricCard label="Interested" value={r?.interested ?? 0} subtitle={`${r?.unread ?? 0} unread`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top campaigns by reply rate */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Top Campaigns by Reply Rate</h3>
          <div className="space-y-2">
            {(campaigns?.campaigns ?? [])
              .filter(c => c.statistics && c.statistics.emails_sent > 50)
              .sort((a, b) => (b.statistics?.reply_rate ?? 0) - (a.statistics?.reply_rate ?? 0))
              .slice(0, 10)
              .map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-zinc-700 truncate block">{c.name}</span>
                    <span className="text-[10px] text-zinc-400">{c.statistics?.emails_sent?.toLocaleString()} sent</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className={`text-xs font-bold ${rateColor(c.statistics?.reply_rate ?? 0)}`}>
                      {c.statistics?.reply_rate?.toFixed(1)}% reply
                    </span>
                    <span className="text-xs text-zinc-400">
                      {c.statistics?.interested ?? 0} interested
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Reply breakdown */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Reply Breakdown</h3>

          <div className="space-y-3">
            {[
              { label: 'Interested', count: r?.interested ?? 0, color: 'bg-emerald-500' },
              { label: 'Not Interested', count: r?.notInterested ?? 0, color: 'bg-red-400' },
              { label: 'Auto-Reply', count: r?.autoReply ?? 0, color: 'bg-zinc-300' },
              { label: 'Other', count: (r?.total ?? 0) - (r?.interested ?? 0) - (r?.notInterested ?? 0) - (r?.autoReply ?? 0), color: 'bg-amber-400' },
            ].map(item => {
              const pct = (r?.total ?? 0) > 0 ? (item.count / r!.total) * 100 : 0
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-600">{item.label}</span>
                    <span className="font-semibold text-zinc-800">{item.count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bounce & deliverability */}
          <div className="mt-6 pt-4 border-t border-zinc-100">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Deliverability</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className={`text-lg font-bold ${rateColor(t?.avgBounceRate ?? 0, [1, 3])}`}>
                  {t?.avgBounceRate ?? 0}%
                </div>
                <div className="text-[10px] text-zinc-500">Avg Bounce Rate</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{(t?.totalBounced ?? 0).toLocaleString()}</div>
                <div className="text-[10px] text-zinc-500">Total Bounced</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
