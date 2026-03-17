import { useCEOStats } from '../hooks/useCEOStats'
import { Spinner } from '../components/Spinner'

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 55) return 'text-amber-600'
  return 'text-red-600'
}

export function CEODashboard() {
  const { data, loading } = useCEOStats()

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-zinc-400">No data available</p>

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Growth Scorecard</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Top Left: LIVE — Sales Performance */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-semibold text-zinc-700">Sales Performance (7d)</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[36px] font-bold text-zinc-900 leading-tight">{data.callsThisWeek}</div>
              <div className="text-xs text-zinc-500">Calls this week</div>
            </div>
            <div>
              <div className={`text-[36px] font-bold leading-tight ${scoreColor(data.avgScore)}`}>{data.avgScore}%</div>
              <div className="text-xs text-zinc-500">Avg score</div>
            </div>
            <div>
              {data.bestRep ? (
                <>
                  <div className="text-lg font-bold text-zinc-900">{data.bestRep.name}</div>
                  <div className="text-xs text-zinc-500">Best rep ({data.bestRep.avg}% avg)</div>
                </>
              ) : (
                <div className="text-xs text-zinc-400">No data</div>
              )}
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900">{data.activeDeals}</div>
              <div className="text-xs text-zinc-500">Active deals</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-zinc-100">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">Close rate</span>
              <span className="text-lg font-bold text-zinc-900">{data.closeRate}%</span>
            </div>
          </div>
        </div>

        {/* Top Right: PLACEHOLDER — Outbound Health */}
        <div className="rounded-lg border-2 border-dashed border-zinc-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            <h3 className="text-sm font-semibold text-zinc-400">Outbound Health</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-zinc-400">Connect EmailBison</p>
            <p className="text-xs text-zinc-300 mt-1">Reply rates, open rates, campaign health</p>
          </div>
        </div>

        {/* Bottom Left: PLACEHOLDER — Client Status */}
        <div className="rounded-lg border-2 border-dashed border-zinc-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            <h3 className="text-sm font-semibold text-zinc-400">Client Status</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-zinc-400">Connect Monday.com</p>
            <p className="text-xs text-zinc-300 mt-1">Active clients, onboarding status, retention</p>
          </div>
        </div>

        {/* Bottom Right: PARTIAL — Alerts */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <h3 className="text-sm font-semibold text-zinc-700">Alerts</h3>
          </div>

          {data.alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-emerald-700">All clear — no active alerts</span>
            </div>
          ) : (
            <div className="space-y-2">
              {data.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg px-4 py-3 ${
                    alert.type === 'danger' ? 'bg-red-50' : 'bg-amber-50'
                  }`}
                >
                  <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    alert.type === 'danger' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <span className={`text-sm ${
                    alert.type === 'danger' ? 'text-red-700' : 'text-amber-700'
                  }`}>{alert.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
