import { useBisonCampaigns } from '../hooks/useBisonCampaigns'
import { Spinner } from '../components/Spinner'

export function CopyLibraryPage() {
  const { data: campaigns, loading, error } = useBisonCampaigns()

  if (loading) return <Spinner />

  if (error && error.includes('not configured')) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-zinc-900">Copy Library</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20">
          <p className="text-sm text-zinc-500">EmailBison API key not configured</p>
          <p className="text-xs text-zinc-400 mt-1">Add EMAILBISON_API_KEY to environment variables</p>
        </div>
      </div>
    )
  }

  // Group campaigns by status
  const all = campaigns?.campaigns ?? []
  const active = all.filter(c => c.status === 'active' || c.status === 'launching')
  const completed = all.filter(c => c.status === 'completed')
  const stopped = all.filter(c => c.status === 'stopped' || c.status === 'paused')

  // Top performers
  const topPerformers = all
    .filter(c => c.statistics && c.statistics.emails_sent > 100)
    .sort((a, b) => (b.statistics?.reply_rate ?? 0) - (a.statistics?.reply_rate ?? 0))
    .slice(0, 15)

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Copy Library</h2>

      {/* Status overview */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-[36px] font-bold text-zinc-900">{all.length}</div>
          <div className="text-xs text-zinc-500">Total Campaigns</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="text-[36px] font-bold text-emerald-700">{active.length}</div>
          <div className="text-xs text-emerald-600">Active</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="text-[36px] font-bold text-blue-700">{completed.length}</div>
          <div className="text-xs text-blue-600">Completed</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
          <div className="text-[36px] font-bold text-zinc-500">{stopped.length}</div>
          <div className="text-xs text-zinc-400">Stopped / Paused</div>
        </div>
      </div>

      {/* Top performing sequences */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-700 mb-4">Top Performing Sequences</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-100">
                <th className="text-left pb-2 pr-4">Campaign</th>
                <th className="text-left pb-2 pr-4">Status</th>
                <th className="text-right pb-2 pr-4">Sent</th>
                <th className="text-right pb-2 pr-4">Opens</th>
                <th className="text-right pb-2 pr-4">Open Rate</th>
                <th className="text-right pb-2 pr-4">Replies</th>
                <th className="text-right pb-2 pr-4">Reply Rate</th>
                <th className="text-right pb-2 pr-4">Interested</th>
                <th className="text-right pb-2">Bounce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {topPerformers.map(c => {
                const s = c.statistics!
                return (
                  <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="py-2.5 pr-4 text-sm text-zinc-800 max-w-[250px] truncate">{c.name}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        c.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                        'bg-zinc-100 text-zinc-500'
                      }`}>{c.status}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-zinc-600 text-right">{s.emails_sent?.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-sm text-zinc-600 text-right">{s.unique_opens?.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-sm font-semibold text-right">
                      <span className={s.open_rate > 50 ? 'text-emerald-600' : s.open_rate > 30 ? 'text-amber-600' : 'text-red-600'}>
                        {s.open_rate?.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-zinc-600 text-right">{s.replies}</td>
                    <td className="py-2.5 pr-4 text-sm font-semibold text-right">
                      <span className={s.reply_rate > 5 ? 'text-emerald-600' : s.reply_rate > 2 ? 'text-amber-600' : 'text-red-600'}>
                        {s.reply_rate?.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-emerald-600 text-right">{s.interested}</td>
                    <td className="py-2.5 text-sm text-right">
                      <span className={s.bounce_rate > 3 ? 'text-red-600' : 'text-zinc-400'}>
                        {s.bounce_rate?.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
