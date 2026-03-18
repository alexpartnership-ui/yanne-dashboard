import { useState, useMemo, useEffect } from 'react'
import { useHubSpotDeals, type HubSpotDeal } from '../hooks/useHubSpotDeals'
import { Spinner } from '../components/Spinner'
import { ExportButton } from '../components/ExportButton'
import { EmptyState } from '../components/EmptyState'
import { apiFetch } from '../hooks/useAuth'

// ─── Constants ──────────────────────────────────────────

const CLOSED_STAGES = ['Closed Won', 'Closed Lost', 'Long Term Lead', 'Disqualified']
const ACTIVE_STAGES = ['Meeting Qualified', 'NDA', '1st Closing Call', '2nd Closing Call', '3rd Call / Contract']
const STAGE_ORDER = [...ACTIVE_STAGES, 'Closed Won', 'Long Term Lead', 'Closed Lost', 'Disqualified']

const STAGE_COLORS: Record<string, string> = {
  'Meeting Qualified': 'bg-[#1A3C34]/10 text-[#1A3C34]',
  'NDA': 'bg-[#1A3C34]/20 text-[#1A3C34]',
  '1st Closing Call': 'bg-[#1A3C34]/30 text-[#1A3C34]',
  '2nd Closing Call': 'bg-[#1A3C34]/40 text-white',
  '3rd Call / Contract': 'bg-[#1A3C34]/60 text-white',
  'Closed Won': 'bg-emerald-100 text-emerald-700',
  'Closed Lost': 'bg-zinc-100 text-zinc-500',
  'Long Term Lead': 'bg-blue-50 text-blue-600',
  'Disqualified': 'bg-zinc-100 text-zinc-400',
}

const KANBAN_BORDER: Record<string, string> = {
  'Meeting Qualified': 'border-t-[#1A3C34]/40',
  'NDA': 'border-t-[#1A3C34]/50',
  '1st Closing Call': 'border-t-[#1A3C34]/60',
  '2nd Closing Call': 'border-t-[#1A3C34]/70',
  '3rd Call / Contract': 'border-t-[#1A3C34]/80',
  'Closed Won': 'border-t-[#00875A]',
  'Closed Lost': 'border-t-zinc-300',
}

const BAR_COLORS: Record<string, string> = {
  'Meeting Qualified': 'bg-[#1A3C34]/40',
  'NDA': 'bg-[#1A3C34]/50',
  '1st Closing Call': 'bg-[#1A3C34]/60',
  '2nd Closing Call': 'bg-[#1A3C34]/70',
  '3rd Call / Contract': 'bg-[#1A3C34]/80',
  'Closed Won': 'bg-[#00875A]',
  'Closed Lost': 'bg-zinc-300',
  'Long Term Lead': 'bg-blue-200',
  'Disqualified': 'bg-zinc-200',
}

// ─── Helpers ────────────────────────────────────────────

function fmt(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

type SortKey = 'name' | 'stageName' | 'amount' | 'closeDate' | 'createDate' | 'lastActivity' | 'dealScore' | 'probability'
type SortDir = 'asc' | 'desc'

function sortDeals(deals: HubSpotDeal[], key: SortKey, dir: SortDir): HubSpotDeal[] {
  return [...deals].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (key) {
      case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break
      case 'stageName': av = STAGE_ORDER.indexOf(a.stageName); bv = STAGE_ORDER.indexOf(b.stageName); break
      case 'amount': av = a.amount ?? -1; bv = b.amount ?? -1; break
      case 'closeDate': av = a.closeDate ?? ''; bv = b.closeDate ?? ''; break
      case 'createDate': av = a.createDate ?? ''; bv = b.createDate ?? ''; break
      case 'lastActivity': av = a.lastActivity ?? ''; bv = b.lastActivity ?? ''; break
      case 'dealScore': av = a.dealScore ?? -1; bv = b.dealScore ?? -1; break
      case 'probability': av = a.probability ?? -1; bv = b.probability ?? -1; break
      default: av = ''; bv = ''
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

// ─── Sort Header ────────────────────────────────────────

function TH({ label, k, cur, dir, onSort, right }: { label: string; k: SortKey; cur: SortKey; dir: SortDir; onSort: (k: SortKey) => void; right?: boolean }) {
  const on = cur === k
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-zinc-600 ${right ? 'text-right' : 'text-left'} ${on ? 'text-[#1A3C34]' : 'text-zinc-400'}`} onClick={() => onSort(k)}>
      {label}{on && <span className="ml-1">{dir === 'asc' ? '\u25B2' : '\u25BC'}</span>}
    </th>
  )
}

// ─── Kanban View ────────────────────────────────────────

function KanbanView({ deals }: { deals: HubSpotDeal[] }) {
  const columns = ACTIVE_STAGES.map(stage => {
    const stageDeals = deals.filter(d => d.stageName === stage)
    const total = stageDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const avg = stageDeals.length > 0 ? total / stageDeals.length : 0
    return { stage, deals: stageDeals, total, avg }
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {columns.map(col => (
        <div key={col.stage} className={`rounded-lg border border-zinc-200 bg-white shadow-sm border-t-[3px] ${KANBAN_BORDER[col.stage] || 'border-t-zinc-300'}`}>
          {/* Column header */}
          <div className="px-3 py-3 border-b border-zinc-100">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold text-zinc-800">{col.stage}</h4>
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">{col.deals.length}</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              <span className="font-semibold text-zinc-700">{fmt(col.total)}</span>
              <span className="mx-1">|</span>
              Total amount
            </div>
            <div className="text-[11px] text-zinc-400">
              <span className="font-medium text-zinc-600">{fmt(col.avg)}</span>
              <span className="mx-1">|</span>
              Average deal
            </div>
          </div>
          {/* Deal cards */}
          <div className="p-2 space-y-1.5 max-h-[500px] overflow-y-auto scrollbar-hide">
            {col.deals.length === 0 ? (
              <div className="py-6 text-center text-[10px] text-zinc-400">No deals</div>
            ) : (
              col.deals.map(d => {
                const actDays = daysSince(d.lastActivity)
                const stale = actDays !== null && actDays >= 30
                return (
                  <div key={d.id} className="rounded-md border border-zinc-100 bg-zinc-50/50 px-3 py-2.5 hover:bg-zinc-50 transition-colors">
                    <div className="text-xs font-medium text-zinc-800 truncate">{d.name}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] font-semibold text-zinc-700">{d.amount ? `$${d.amount.toLocaleString()}` : '\u2014'}</span>
                      <span className={`text-[10px] ${stale ? 'text-red-600 font-semibold' : 'text-zinc-400'}`}>
                        {actDays !== null ? `${actDays}d` : ''}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Stage Summary Cards ────────────────────────────────

function StageSummary({ deals }: { deals: HubSpotDeal[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
      {ACTIVE_STAGES.map(stage => {
        const stageDeals = deals.filter(d => d.stageName === stage)
        const total = stageDeals.reduce((s, d) => s + (d.amount || 0), 0)
        const avg = stageDeals.length > 0 ? total / stageDeals.length : 0
        return (
          <div key={stage} className="rounded-lg bg-white border border-zinc-200 px-3 py-3 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${STAGE_COLORS[stage]}`}>{stage}</span>
              <span className="text-sm font-bold text-zinc-900">{stageDeals.length}</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              <span className="font-semibold text-zinc-700">{fmt(total)}</span> total
            </div>
            <div className="text-[10px] text-zinc-400">
              {fmt(avg)} avg per deal
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────

// ─── Forecast + Stale Alerts ────────────────────────────

interface ForecastData {
  stageBreakdown: { stage: string; count: number; totalAmount: number; probability: number; weighted: number }[]
  totalWeighted: number
  totalActive: number
  staleDeals: { name: string; stage: string; amount: number; closeDate: string | null; activityDays: number | null; reason: string }[]
  staleCount: number
  staleTotalAmount: number
  thisMonth: { deals: number; value: number; month: string }
}

function ForecastSection() {
  const [data, setData] = useState<ForecastData | null>(null)
  const [showStale, setShowStale] = useState(false)

  useEffect(() => {
    apiFetch('/api/forecast').then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  }, [])

  if (!data) return null

  return (
    <div className="mb-5 space-y-3">
      {/* Forecast bar */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Revenue Forecast</h3>
            <p className="text-[10px] text-zinc-400">Weighted by stage probability</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-[#1A3C34]">{fmt(data.totalWeighted)}</div>
            <div className="text-[10px] text-zinc-400">weighted forecast</div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-center">
          {data.stageBreakdown.map(s => (
            <div key={s.stage} className="rounded bg-zinc-50 px-2 py-2">
              <div className="text-[9px] font-semibold text-zinc-500 uppercase">{s.stage}</div>
              <div className="text-sm font-bold text-zinc-800 mt-0.5">{fmt(s.weighted)}</div>
              <div className="text-[9px] text-zinc-400">{s.count} deals x {Math.round(s.probability * 100)}%</div>
            </div>
          ))}
        </div>
        {data.thisMonth.deals > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-[#1A3C34]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1A3C34]">{data.thisMonth.month}</span>
            <span className="text-zinc-600">{data.thisMonth.deals} deals closing this month — {fmt(data.thisMonth.value)}</span>
          </div>
        )}
      </div>

      {/* Stale deals alert */}
      {data.staleCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-bold text-red-800">{data.staleCount} Stale Deals</span>
              <span className="text-xs text-red-600">— {fmt(data.staleTotalAmount)} at risk</span>
            </div>
            <button onClick={() => setShowStale(!showStale)} className="text-xs text-red-700 underline">{showStale ? 'Hide' : 'Show details'}</button>
          </div>
          {showStale && (
            <div className="mt-3 space-y-1.5">
              {data.staleDeals.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-3 py-2">
                  <div>
                    <span className="font-medium text-zinc-800">{d.name}</span>
                    <span className="ml-2 text-zinc-400">{d.stage}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-600">{d.amount ? `$${d.amount.toLocaleString()}` : '\u2014'}</span>
                    <span className="text-red-600 font-medium">{d.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DealsPage() {
  const { data: hubspot, loading, error } = useHubSpotDeals()
  const [stageFilter, setStageFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('createDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'table' | 'kanban'>('table')
  const PAGE_SIZE = 50

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  const allDeals = hubspot?.deals ?? []

  const stats = useMemo(() => {
    const active = allDeals.filter(d => !CLOSED_STAGES.includes(d.stageName))
    const won = allDeals.filter(d => d.stageName === 'Closed Won')
    const lost = allDeals.filter(d => d.stageName === 'Closed Lost')
    const activeValue = active.reduce((s, d) => s + (d.amount || 0), 0)
    const totalValue = allDeals.reduce((s, d) => s + (d.amount || 0), 0)
    return { activeCount: active.length, activeValue, wonCount: won.length, lostCount: lost.length, totalValue, totalCount: allDeals.length }
  }, [allDeals])

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const d of allDeals) c[d.stageName] = (c[d.stageName] || 0) + 1
    return c
  }, [allDeals])

  const displayed = useMemo(() => {
    let list = allDeals
    if (stageFilter === 'active') list = list.filter(d => !CLOSED_STAGES.includes(d.stageName))
    else if (stageFilter !== 'all') list = list.filter(d => d.stageName === stageFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q))
    }
    return sortDeals(list, sortKey, sortDir)
  }, [allDeals, stageFilter, search, sortKey, sortDir])

  const totalPages = Math.ceil(displayed.length / PAGE_SIZE)
  const pageDeals = displayed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (loading) return <Spinner />
  if (error) return <div className="text-sm text-red-600">HubSpot: {error}</div>

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A3C34]">HubSpot Deals</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Sales Pipeline — {stats.totalCount} total deals</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-zinc-200 overflow-hidden">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 text-xs font-medium ${view === 'table' ? 'bg-[#1A3C34] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'}`}>
              Table
            </button>
            <button onClick={() => setView('kanban')} className={`px-3 py-1.5 text-xs font-medium ${view === 'kanban' ? 'bg-[#1A3C34] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'}`}>
              Kanban
            </button>
          </div>
          <ExportButton type="deals" />
          <select
            value={stageFilter}
            onChange={e => { setStageFilter(e.target.value); setPage(0) }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm"
          >
            <option value="active">Active Stages ({stats.activeCount})</option>
            <option value="all">All Deals ({stats.totalCount})</option>
            {STAGE_ORDER.map(s => {
              const count = stageCounts[s] || 0
              if (count === 0) return null
              return <option key={s} value={s}>{s} ({count})</option>
            })}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-[#1A3C34]">{stats.activeCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Active Deals</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-[#1A3C34]">{fmt(stats.activeValue)}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Active Pipeline Value</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-[#00875A]">{stats.wonCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Closed Won</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-zinc-400">{stats.lostCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Closed Lost</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-zinc-900">{fmt(stats.totalValue)}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Total Pipeline Value</div>
        </div>
      </div>

      {/* Forecast + Stale Alerts */}
      <ForecastSection />

      {/* Per-Stage Amount + Average Cards */}
      <StageSummary deals={allDeals} />

      {/* Pipeline Stage Bar */}
      <div className="mb-5 flex h-3 rounded-full overflow-hidden bg-zinc-100">
        {STAGE_ORDER.map(stage => {
          const count = stageCounts[stage] || 0
          if (count === 0) return null
          const pct = (count / Math.max(stats.totalCount, 1)) * 100
          return (
            <div key={stage} className={`${BAR_COLORS[stage] || 'bg-zinc-300'} transition-all cursor-pointer hover:opacity-80`} style={{ width: `${pct}%` }} title={`${stage}: ${count} deals`} onClick={() => { setStageFilter(stage); setPage(0) }} />
          )
        })}
      </div>

      {/* Kanban View */}
      {view === 'kanban' ? (
        <KanbanView deals={allDeals.filter(d => !CLOSED_STAGES.includes(d.stageName))} />
      ) : (
        <>
          {/* Search + Pagination */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Search deals..." className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-[#1A3C34] focus:outline-none w-72" />
              {search && <span className="text-xs text-zinc-400">{displayed.length} results</span>}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 rounded border border-zinc-200 disabled:opacity-30 hover:bg-zinc-50">Prev</button>
                <span>{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 rounded border border-zinc-200 disabled:opacity-30 hover:bg-zinc-50">Next</button>
              </div>
            )}
          </div>

          {/* Deals Table */}
          {displayed.length === 0 ? (
            <EmptyState title="No deals match" description="Try changing the stage filter or search query" />
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 border-b border-zinc-100">
                    <tr>
                      <TH label="Deal Name" k="name" cur={sortKey} dir={sortDir} onSort={handleSort} />
                      <TH label="Stage" k="stageName" cur={sortKey} dir={sortDir} onSort={handleSort} />
                      <TH label="Amount" k="amount" cur={sortKey} dir={sortDir} onSort={handleSort} right />
                      <TH label="Close Date" k="closeDate" cur={sortKey} dir={sortDir} onSort={handleSort} right />
                      <TH label="Created" k="createDate" cur={sortKey} dir={sortDir} onSort={handleSort} right />
                      <TH label="Last Activity" k="lastActivity" cur={sortKey} dir={sortDir} onSort={handleSort} right />
                      <TH label="Score" k="dealScore" cur={sortKey} dir={sortDir} onSort={handleSort} right />
                      <TH label="Prob" k="probability" cur={sortKey} dir={sortDir} onSort={handleSort} right />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {pageDeals.map(d => {
                      const actDays = daysSince(d.lastActivity)
                      const stale = actDays !== null && actDays >= 30
                      return (
                        <tr key={d.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-zinc-800 max-w-[250px] truncate">{d.name}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STAGE_COLORS[d.stageName] || 'bg-zinc-100 text-zinc-600'}`}>{d.stageName}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-700 text-right font-medium tabular-nums">{d.amount ? `$${d.amount.toLocaleString()}` : '\u2014'}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500 text-right">{fmtDate(d.closeDate)}</td>
                          <td className="px-4 py-3 text-xs text-zinc-400 text-right">{fmtDate(d.createDate)}</td>
                          <td className={`px-4 py-3 text-xs text-right font-medium ${stale ? 'text-red-600' : 'text-zinc-400'}`}>{actDays !== null ? `${actDays}d ago` : '\u2014'}</td>
                          <td className="px-4 py-3 text-xs text-right">
                            {d.dealScore !== null ? (
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${d.dealScore >= 70 ? 'bg-emerald-100 text-emerald-700' : d.dealScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{Math.round(d.dealScore)}</span>
                            ) : '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-xs text-right text-zinc-500">{d.probability !== null ? `${Math.round(d.probability * 100)}%` : '\u2014'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, displayed.length)} of {displayed.length}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 rounded border border-zinc-200 disabled:opacity-30 hover:bg-zinc-50">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 rounded border border-zinc-200 disabled:opacity-30 hover:bg-zinc-50">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
