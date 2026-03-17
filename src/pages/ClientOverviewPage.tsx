import { useAirtableMeetings } from '../hooks/useAirtableMeetings'
import { useDeals } from '../hooks/useDeals'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

export function ClientOverviewPage() {
  const { data: meetings, loading: loadingM, error: errorM } = useAirtableMeetings()
  const { data: deals, loading: loadingD, error: errorD } = useDeals()

  if (loadingM || loadingD) return <Spinner />

  const signedDeals = deals.filter(d => d.deal_status === 'signed')
  const activeDeals = deals.filter(d => d.deal_status === 'active')
  const lostDeals = deals.filter(d => d.deal_status === 'lost')
  const closeRate = deals.length > 0 ? Math.round((signedDeals.length / deals.length) * 100) : 0

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Client Overview</h2>

      {(errorM || errorD) && (
        <p className="mb-4 text-sm text-red-600">Error: {errorM || errorD}</p>
      )}

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Signed Clients" value={signedDeals.length} />
        <MetricCard label="Active Pipeline" value={activeDeals.length} />
        <MetricCard label="Lost Deals" value={lostDeals.length} />
        <MetricCard label="Close Rate" value={`${closeRate}%`} />
        <MetricCard label="Meetings This Month" value={meetings?.thisMonth ?? 0} subtitle={`${meetings?.thisWeek ?? 0} this week`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Signed clients list */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Signed Clients</h3>
          {signedDeals.length === 0 ? (
            <p className="text-xs text-zinc-400">No signed deals yet</p>
          ) : (
            <div className="space-y-2">
              {signedDeals.map(d => (
                <div key={d.deal_id} className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-zinc-800">{d.prospect_company}</span>
                    <span className="text-xs text-zinc-400 ml-2">{d.rep_name}</span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Signed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming meetings */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Recent Meetings</h3>
          {!meetings || meetings.meetings.length === 0 ? (
            <p className="text-xs text-zinc-400">No meetings data</p>
          ) : (
            <div className="space-y-2">
              {meetings.meetings.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-zinc-700 block truncate">{m.title}</span>
                    <span className="text-[10px] text-zinc-400">{m.attendeeNames}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 shrink-0 ml-2">
                    {m.startTime ? new Date(m.startTime).toLocaleDateString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
