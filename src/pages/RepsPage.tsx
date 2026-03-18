import { useEffect, useState } from 'react'
import { useReps } from '../hooks/useReps'
import { useRepCallHistory } from '../hooks/useRepCallHistory'
import { ScoreRing } from '../components/ScoreRing'
import { Sparkline } from '../components/Sparkline'
import { Spinner } from '../components/Spinner'
import { ExportButton } from '../components/ExportButton'
import { apiFetch } from '../hooks/useAuth'
import { repBorderClass } from '../lib/repColors'
import type { RepPerformance } from '../types/database'

interface AdherenceData {
  rep: string
  currentFocus: string | null
  adherenceRate: number
  addressedCount: number
  totalRecent: number
  weakestCategory: string | null
  repeatingIssue: string | null
  recentScores: { date: string; score: number; type: string }[]
}

function sortByVolume(reps: RepPerformance[]): RepPerformance[] {
  return [...reps].sort((a, b) => b.total_scored_calls - a.total_scored_calls)
}

export function RepsPage() {
  const { data: reps, loading, error } = useReps()
  const { data: history } = useRepCallHistory()
  const [adherence, setAdherence] = useState<AdherenceData[]>([])

  useEffect(() => {
    apiFetch('/api/coaching-adherence').then(r => r.ok ? r.json() : []).then(setAdherence).catch(() => {})
  }, [])

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>

  const sorted = sortByVolume(reps)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-yanne">Rep Performance</h2>
        <ExportButton type="reps" />
      </div>

      <div className="space-y-4">
        {sorted.map(rep => {
          const borderColor = repBorderClass(rep.rep)
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
                <div className="tooltip-wrap relative text-xs text-zinc-400">
                  Qualification rate: <span className="font-semibold text-zinc-700">{(rep.qualification_rate * 100).toFixed(0)}%</span>
                  <div className="tooltip-text absolute right-0 bottom-full mb-1 z-50 w-64 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-white shadow-lg">
                    % of Call 1s where the prospect was genuinely qualified
                  </div>
                </div>
              </div>

              {/* Scores with rings + sparklines */}
              <div className="grid grid-cols-3 gap-6 px-6 pb-4">
                <div className="flex items-start gap-4">
                  <ScoreRing label="Call 1" score={rep.call_1_rolling_avg} trend={rep.call_1_trend} />
                  <div className="flex-1 pt-2">
                    <Sparkline data={callHistory} callType="Call 1" rep={rep.rep} />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <ScoreRing label="Call 2" score={rep.call_2_rolling_avg} trend={rep.call_2_trend} />
                  <div className="flex-1 pt-2">
                    <Sparkline data={callHistory} callType="Call 2" rep={rep.rep} />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <ScoreRing label="Call 3" score={rep.call_3_rolling_avg} trend={rep.call_3_trend} />
                  <div className="flex-1 pt-2">
                    <Sparkline data={callHistory} callType="Call 3" rep={rep.rep} />
                  </div>
                </div>
              </div>

              {/* Bottom row: categories + coaching */}
              <div className="border-t border-zinc-100 px-6 py-4 flex gap-8 items-start">
                <div className="flex gap-8 text-sm shrink-0">
                  <div>
                    <span className="text-[11px] text-zinc-400 uppercase tracking-wider block mb-0.5">Strongest</span>
                    <span className="font-medium text-zinc-800">{rep.strongest_category ?? '\u2014'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 uppercase tracking-wider block mb-0.5">Weakest</span>
                    <span className="font-medium text-zinc-800">{rep.weakest_category ?? '\u2014'}</span>
                  </div>
                </div>

                {rep.current_coaching_focus && (
                  <div className="flex-1 rounded-lg border-l-4 border-l-yellow-400 bg-yellow-50 px-4 py-2.5">
                    <span className="text-[10px] text-yellow-700 uppercase tracking-wider font-semibold block mb-0.5">Coaching Focus</span>
                    <p className="text-sm text-yellow-900 leading-relaxed">{rep.current_coaching_focus}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Coaching Adherence */}
      {adherence.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-bold text-zinc-900 mb-3">Coaching Accountability</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {adherence.map(a => (
              <div key={a.rep} className={`rounded-lg border bg-white p-4 shadow-sm ${a.repeatingIssue ? 'border-red-200' : 'border-zinc-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-zinc-800">{a.rep}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.adherenceRate >= 50 ? 'bg-emerald-100 text-emerald-700' : a.adherenceRate >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {a.adherenceRate}% adherence
                  </span>
                </div>
                {a.currentFocus && (
                  <div className="mb-2">
                    <span className="text-[10px] text-zinc-400 uppercase">Current Focus:</span>
                    <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{a.currentFocus}</p>
                  </div>
                )}
                {a.repeatingIssue && (
                  <div className="rounded bg-red-50 px-2.5 py-1.5 mb-2">
                    <span className="text-[10px] font-semibold text-red-700">Repeating Issue (3+ calls):</span>
                    <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{a.repeatingIssue}</p>
                  </div>
                )}
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[10px] text-zinc-400">Last 5:</span>
                  {a.recentScores.map((s, i) => (
                    <span key={i} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${s.score >= 70 ? 'bg-emerald-100 text-emerald-700' : s.score >= 55 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {s.score}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
