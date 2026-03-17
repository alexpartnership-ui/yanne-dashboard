import { useAirtableInbox } from '../hooks/useAirtableInbox'
import { useAirtableMeetings } from '../hooks/useAirtableMeetings'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

export function SetterPerformancePage() {
  const { data: inbox, loading: loadingI, error: errorI } = useAirtableInbox()
  const { data: meetings, loading: loadingM, error: errorM } = useAirtableMeetings()

  if (loadingI || loadingM) return <Spinner />

  const apiError = errorI || errorM
  if (apiError && apiError.includes('not configured')) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-zinc-900">Setter Performance</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20">
          <p className="text-sm text-zinc-500">Airtable API key not configured</p>
          <p className="text-xs text-zinc-400 mt-1">Add AIRTABLE_API_KEY to environment variables</p>
        </div>
      </div>
    )
  }

  const setters = inbox?.setterStats ?? []
  const totalMeetingsBooked = inbox?.categoryCounts['Meeting Booked'] ?? 0
  const totalInterested = inbox?.categoryCounts['Interested'] ?? 0
  const unactioned = setters.reduce((s, st) => s + st.unactioned, 0)

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Setter Performance</h2>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Total Replies Handled" value={inbox?.totalRecords ?? 0} />
        <MetricCard label="Meetings Booked" value={totalMeetingsBooked} />
        <MetricCard label="Interested Leads" value={totalInterested} />
        <MetricCard label="Unactioned Replies" value={unactioned} />
        <MetricCard label="Meetings This Week" value={meetings?.thisWeek ?? 0} subtitle={`${meetings?.thisMonth ?? 0} this month`} />
      </div>

      {/* Setter cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {setters.map(setter => {
          const convRate = setter.total > 0 ? Math.round((setter.meetingsBooked / setter.total) * 100) : 0
          return (
            <div key={setter.name} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-lg font-bold text-zinc-900">{setter.name}</h3>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
                  {setter.total} replies
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-50 p-3">
                  <div className="text-2xl font-bold text-emerald-700">{setter.meetingsBooked}</div>
                  <div className="text-[10px] text-emerald-600">Meetings Booked</div>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <div className="text-2xl font-bold text-blue-700">{convRate}%</div>
                  <div className="text-[10px] text-blue-600">Conversion Rate</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <div className="text-2xl font-bold text-amber-700">{setter.interested}</div>
                  <div className="text-[10px] text-amber-600">Interested</div>
                </div>
                <div className={`rounded-lg p-3 ${setter.unactioned > 5 ? 'bg-red-50' : 'bg-zinc-50'}`}>
                  <div className={`text-2xl font-bold ${setter.unactioned > 5 ? 'text-red-700' : 'text-zinc-700'}`}>
                    {setter.unactioned}
                  </div>
                  <div className={`text-[10px] ${setter.unactioned > 5 ? 'text-red-600' : 'text-zinc-500'}`}>Unactioned</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Meeting hosts */}
      {meetings && Object.keys(meetings.byHost).length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Meetings by Host</h3>
          <div className="space-y-2">
            {Object.entries(meetings.byHost)
              .sort((a, b) => b[1] - a[1])
              .map(([host, count]) => (
                <div key={host} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="text-xs text-zinc-700">{host}</span>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
