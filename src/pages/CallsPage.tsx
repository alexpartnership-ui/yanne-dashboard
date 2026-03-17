import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCallLogs, type CallFilters } from '../hooks/useCallLogs'
import { FilterBar } from '../components/FilterBar'
import { GroupedCallTable } from '../components/GroupedCallTable'
import { GradeDistributionBar } from '../components/GradeDistributionBar'
import { Spinner } from '../components/Spinner'

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 55) return 'text-amber-600'
  return 'text-red-600'
}

function mostCommonCoaching(calls: { coaching_priority: string | null }[]): string {
  const freq: Record<string, number> = {}
  for (const c of calls) {
    if (c.coaching_priority) {
      const key = c.coaching_priority.slice(0, 80)
      freq[key] = (freq[key] || 0) + 1
    }
  }
  let best = '', max = 0
  for (const [k, v] of Object.entries(freq)) {
    if (v > max) { best = k; max = v }
  }
  return best || '\u2014'
}

export function CallsPage() {
  const [filters, setFilters] = useState<CallFilters>({ dateRange: 'all' })
  const { data, loading, error } = useCallLogs(filters)
  const navigate = useNavigate()

  const stats = useMemo(() => {
    if (!data.length) return null
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = data.filter(c => c.date && c.date.slice(0, 10) === today).length
    const avgScore = Math.round(data.reduce((s, c) => s + c.score_percentage, 0) / data.length)
    return { total: data.length, todayCount, avgScore }
  }, [data])

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-bold text-zinc-900">Scored Calls</h2>
          {stats && stats.todayCount > 0 && (
            <span className="rounded-full bg-yanne/10 px-2.5 py-0.5 text-xs font-semibold text-yanne">
              {stats.todayCount} today
            </span>
          )}
        </div>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}

      {/* Stats bar */}
      {stats && (
        <div className="mb-5 grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold text-zinc-900">{stats.total}</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wider">Total Calls</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className={`text-2xl font-bold ${scoreColor(stats.avgScore)}`}>{stats.avgScore}%</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wider">Avg Score</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Grade Distribution</div>
            <GradeDistributionBar calls={data} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Top Coaching Theme</div>
            <div className="text-sm text-zinc-700 leading-snug">{mostCommonCoaching(data)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <GroupedCallTable
          data={data}
          onRowClick={row => navigate(`/calls/${row.id}`)}
        />
      )}
    </div>
  )
}
