import { useReps } from '../hooks/useReps'
import { StatCard } from '../components/StatCard'
import { Spinner } from '../components/Spinner'

export function RepsPage() {
  const { data: reps, loading } = useReps()

  if (loading) return <Spinner />

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">Rep Performance</h2>

      <div className="grid gap-6 md:grid-cols-2">
        {reps.map(rep => (
          <div key={rep.id} className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900">{rep.rep}</h3>
              <span className="text-sm text-zinc-500">{rep.total_scored_calls} calls scored</span>
            </div>

            {/* Rolling Averages */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <StatCard label="Call 1 Avg" value={`${rep.call_1_rolling_avg}%`} trend={rep.call_1_trend} />
              <StatCard label="Call 2 Avg" value={`${rep.call_2_rolling_avg}%`} trend={rep.call_2_trend} />
              <StatCard label="Call 3 Avg" value={`${rep.call_3_rolling_avg}%`} trend={rep.call_3_trend} />
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Strongest Category</span>
                <span className="font-medium text-zinc-900">{rep.strongest_category ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Weakest Category</span>
                <span className="font-medium text-zinc-900">{rep.weakest_category ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Qualification Rate</span>
                <span className="font-medium text-zinc-900">{(rep.qualification_rate * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Coaching Focus</span>
                <span className="max-w-[60%] truncate text-right font-medium text-zinc-900">
                  {rep.current_coaching_focus ?? '—'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
