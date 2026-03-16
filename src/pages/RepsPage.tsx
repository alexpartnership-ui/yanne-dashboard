import { useReps } from '../hooks/useReps'
import { useRepCallHistory } from '../hooks/useRepCallHistory'
import { ScoreBar } from '../components/ScoreBar'
import { Sparkline } from '../components/Sparkline'
import { Spinner } from '../components/Spinner'
import type { RepPerformance } from '../types/database'

const REP_ORDER = ['Jake', 'Stanley', 'Thomas', 'Tahawar']

const REP_COLORS: Record<string, string> = {
  Jake: 'border-l-blue-500',
  Stanley: 'border-l-violet-500',
  Thomas: 'border-l-amber-500',
  Tahawar: 'border-l-emerald-500',
}

function sortReps(reps: RepPerformance[]): RepPerformance[] {
  return [...reps].sort((a, b) => {
    const ai = REP_ORDER.indexOf(a.rep)
    const bi = REP_ORDER.indexOf(b.rep)
    if (ai === -1 && bi === -1) return b.total_scored_calls - a.total_scored_calls
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

export function RepsPage() {
  const { data: reps, loading, error } = useReps()
  const { data: history } = useRepCallHistory()

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>

  const sorted = sortReps(reps)

  return (
    <div>
      <h2 className="mb-6 text-lg font-semibold text-zinc-900">Rep Performance</h2>

      <div className="space-y-4">
        {sorted.map(rep => {
          const borderColor = REP_COLORS[rep.rep] ?? 'border-l-zinc-400'
          const callHistory = history[rep.rep] ?? []

          return (
            <div
              key={rep.id}
              className={`rounded-lg border border-zinc-200 bg-white shadow-sm hover:shadow-md transition-shadow border-l-4 ${borderColor}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <div className="flex items-baseline gap-3">
                  <h3 className="text-2xl font-bold text-zinc-900">{rep.rep}</h3>
                  <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs font-medium text-zinc-500">
                    {rep.total_scored_calls} calls scored
                  </span>
                </div>
                <div className="text-xs text-zinc-400">
                  Qualification rate: <span className="font-semibold text-zinc-700">{(rep.qualification_rate * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* Scores + Sparklines */}
              <div className="grid grid-cols-3 gap-6 px-6 pb-4">
                <div>
                  <ScoreBar label="Call 1" score={rep.call_1_rolling_avg} trend={rep.call_1_trend} />
                  <Sparkline data={callHistory} callType="Call 1" />
                </div>
                <div>
                  <ScoreBar label="Call 2" score={rep.call_2_rolling_avg} trend={rep.call_2_trend} />
                  <Sparkline data={callHistory} callType="Call 2" />
                </div>
                <div>
                  <ScoreBar label="Call 3" score={rep.call_3_rolling_avg} trend={rep.call_3_trend} />
                  <Sparkline data={callHistory} callType="Call 3" />
                </div>
              </div>

              {/* Bottom row: categories + coaching */}
              <div className="border-t border-zinc-100 px-6 py-4 flex gap-8 items-start">
                <div className="flex gap-8 text-sm shrink-0">
                  <div>
                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-0.5">Strongest</span>
                    <span className="font-medium text-zinc-800">{rep.strongest_category ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-0.5">Weakest</span>
                    <span className="font-medium text-zinc-800">{rep.weakest_category ?? '—'}</span>
                  </div>
                </div>

                {rep.current_coaching_focus && (
                  <div className="flex-1 rounded-md border-l-4 border-l-yellow-400 bg-yellow-50 px-4 py-2">
                    <span className="text-xs text-yellow-700 uppercase tracking-wider font-medium block mb-0.5">Coaching Focus</span>
                    <p className="text-sm text-yellow-900 leading-relaxed">{rep.current_coaching_focus}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
