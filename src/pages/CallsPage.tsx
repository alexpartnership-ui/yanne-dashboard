import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCallLogs, type CallFilters } from '../hooks/useCallLogs'
import { FilterBar } from '../components/FilterBar'
import { GroupedCallTable } from '../components/GroupedCallTable'
import { GradeDistributionBar } from '../components/GradeDistributionBar'
import { Spinner } from '../components/Spinner'
import { ExportButton } from '../components/ExportButton'
import { EmptyState } from '../components/EmptyState'

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 55) return 'text-amber-600'
  return 'text-red-600'
}

function mostCommonCoaching(calls: { coaching_priority: string | null }[]): string {
  const freq: Record<string, number> = {}
  for (const c of calls) {
    if (c.coaching_priority) {
      const key = c.coaching_priority
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
  const [search, setSearch] = useState('')
  const { data, loading, error } = useCallLogs(filters)
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()
    return data.filter(c =>
      (c.prospect_company && c.prospect_company.toLowerCase().includes(q)) ||
      (c.rep && c.rep.toLowerCase().includes(q)) ||
      (c.prospect_contact && c.prospect_contact.toLowerCase().includes(q)) ||
      (c.coaching_priority && c.coaching_priority.toLowerCase().includes(q)) ||
      (c.call_type && c.call_type.toLowerCase().includes(q)) ||
      (c.grade && c.grade.toLowerCase().includes(q))
    )
  }, [data, search])

  const stats = useMemo(() => {
    if (!filtered.length) return null
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = filtered.filter(c => c.date && c.date.slice(0, 10) === today).length
    const avgScore = Math.round(filtered.reduce((s, c) => s + c.score_percentage, 0) / filtered.length)
    return { total: filtered.length, todayCount, avgScore }
  }, [filtered])

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-bold text-text-primary">Scored Calls</h2>
          {stats && stats.todayCount > 0 && (
            <span className="rounded-full bg-yanne/10 px-2.5 py-0.5 text-xs font-semibold text-yanne">
              {stats.todayCount} today
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="calls" />
          <FilterBar filters={filters} onChange={setFilters} />
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by company, rep, contact, grade..."
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary shadow-sm focus:border-yanne focus:outline-none w-80"
        />
        {search && (
          <span className="text-xs text-text-faint">{filtered.length} of {data.length} calls</span>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}

      {/* Stats bar */}
      {stats && (
        <div className="mb-5 grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
            <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
            <div className="text-[11px] text-text-muted mt-1 uppercase tracking-wider">Total Calls</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
            <div className={`text-2xl font-bold ${scoreColor(stats.avgScore)}`}>{stats.avgScore}%</div>
            <div className="text-[11px] text-text-muted mt-1 uppercase tracking-wider">Avg Score</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
            <div className="text-[11px] text-text-muted uppercase tracking-wider mb-2">Grade Distribution</div>
            <GradeDistributionBar calls={filtered} />
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
            <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Top Coaching Theme</div>
            <div className="text-sm text-text-secondary leading-snug">{mostCommonCoaching(filtered)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState title="No calls scored yet" description="Calls will appear here once they've been scored by the pipeline" />
      ) : (
        <GroupedCallTable
          data={filtered}
          onRowClick={row => navigate(`/calls/${row.id}`)}
        />
      )}
    </div>
  )
}
