import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallLogs, type CallFilters } from '../hooks/useCallLogs'
import { DataTable } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { GradeBadge, scoreBadgeColor } from '../components/GradeBadge'
import { Spinner } from '../components/Spinner'
import { repDotClass } from '../lib/repColors'
import type { CallLog } from '../types/database'

const col = createColumnHelper<CallLog>()

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 55) return 'text-amber-600'
  return 'text-red-600'
}

// Grade distribution mini bar
function GradeDistribution({ calls }: { calls: CallLog[] }) {
  const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const c of calls) {
    if (!c.grade) continue
    const letter = c.grade.charAt(0) as keyof typeof counts
    if (letter in counts) counts[letter]++
  }
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (total === 0) return <div className="text-xs text-zinc-400">No grades</div>

  const colors = { A: 'bg-emerald-500', B: 'bg-emerald-300', C: 'bg-amber-400', D: 'bg-orange-400', F: 'bg-red-500' }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100">
        {(Object.keys(counts) as (keyof typeof counts)[]).map(g =>
          counts[g] > 0 ? (
            <div key={g} className={`${colors[g]} transition-all`} style={{ width: `${(counts[g] / total) * 100}%` }} />
          ) : null
        )}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-zinc-500">
        {(Object.keys(counts) as (keyof typeof counts)[]).map(g =>
          counts[g] > 0 ? <span key={g}>{g}: {counts[g]}</span> : null
        )}
      </div>
    </div>
  )
}

function mostCommonCoaching(calls: CallLog[]): string {
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
  return best || '—'
}

const columns = [
  col.accessor('date', {
    header: 'Date',
    cell: info => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '—',
  }),
  col.accessor('rep', {
    header: 'Rep',
    cell: info => {
      const rep = info.getValue()
      return (
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${repDotClass(rep)}`} />
          <span>{rep}</span>
        </div>
      )
    },
  }),
  col.accessor('prospect_company', {
    header: 'Prospect',
    cell: info => (
      <span className="font-medium text-yanne hover:underline cursor-pointer">
        {info.getValue() ?? '—'}
      </span>
    ),
  }),
  col.accessor('call_type', { header: 'Type' }),
  col.accessor('score_percentage', {
    header: 'Score',
    cell: info => {
      const val = info.getValue()
      return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${scoreBadgeColor(val)}`}>
          {val}%
        </span>
      )
    },
  }),
  col.accessor('grade', {
    header: 'Grade',
    cell: info => <GradeBadge grade={info.getValue()} />,
  }),
  col.accessor('coaching_priority', {
    header: 'Coaching Priority',
    cell: info => {
      const val = info.getValue()
      if (!val) return <span className="text-zinc-300">—</span>
      const short = val.length > 60 ? val.slice(0, 60) + '...' : val
      return (
        <div className="tooltip-wrap relative max-w-[200px]">
          <span className="text-xs text-zinc-600">{short}</span>
          {val.length > 60 && (
            <div className="tooltip-text absolute left-0 bottom-full mb-1 z-50 w-72 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-white shadow-lg">
              {val}
            </div>
          )}
        </div>
      )
    },
  }),
]

export function CallsPage() {
  const [filters, setFilters] = useState<CallFilters>({ dateRange: 'all' })
  const { data, loading, error } = useCallLogs(filters)
  const navigate = useNavigate()

  const stats = useMemo(() => {
    if (!data.length) return null
    const now = new Date()
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
    const thisWeek = data.filter(c => c.scored_at && new Date(c.scored_at) >= weekAgo)
    const avgScore = Math.round(data.reduce((s, c) => s + c.score_percentage, 0) / data.length)
    return { total: data.length, thisWeek: thisWeek.length, avgScore }
  }, [data])

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-yanne">Scored Calls</h2>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}

      {/* Stats bar */}
      {stats && (
        <div className="mb-5 grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-2xl font-bold text-zinc-900">{stats.total}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{stats.thisWeek} this week</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wider">Total Calls</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className={`text-2xl font-bold ${scoreColor(stats.avgScore)}`}>{stats.avgScore}%</div>
            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wider">Avg Score</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Grade Distribution</div>
            <GradeDistribution calls={data} />
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
        <DataTable
          data={data}
          columns={columns}
          onRowClick={row => navigate(`/calls/${row.id}`)}
          striped
        />
      )}
    </div>
  )
}
