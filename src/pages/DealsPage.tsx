import { useState, useMemo } from 'react'
import { useHubSpotDeals, type HubSpotDeal } from '../hooks/useHubSpotDeals'
import { Spinner } from '../components/Spinner'
import { ExportButton } from '../components/ExportButton'
import { EmptyState } from '../components/EmptyState'

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

function formatCurrency(value: number): string {
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

type SortKey = 'name' | 'stageName' | 'amount' | 'closeDate' | 'createDate' | 'lastActivity'
type SortDir = 'asc' | 'desc'

function sortDeals(deals: HubSpotDeal[], key: SortKey, dir: SortDir): HubSpotDeal[] {
  return [...deals].sort((a, b) => {
    let av: string | number | null, bv: string | number | null
    switch (key) {
      case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break
      case 'stageName': av = STAGE_ORDER.indexOf(a.stageName); bv = STAGE_ORDER.indexOf(b.stageName); break
      case 'amount': av = a.amount ?? -1; bv = b.amount ?? -1; break
      case 'closeDate': av = a.closeDate ?? ''; bv = b.closeDate ?? ''; break
      case 'createDate': av = a.createDate ?? ''; bv = b.createDate ?? ''; break
      case 'lastActivity': av = a.lastActivity ?? ''; bv = b.lastActivity ?? ''; break
      default: av = ''; bv = ''
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

// ─── Sort Header ────────────────────────────────────────

function SortHeader({ label, sortKey, currentKey, dir, onSort, align = 'left' }: {
  label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir; onSort: (k: SortKey) => void; align?: 'left' | 'right'
}) {
  const active = currentKey === sortKey
  return (
    <th
      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-zinc-600 transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-[#1A3C34]' : 'text-zinc-400'}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '\u25B2' : '\u25BC'}</span>}
    </th>
  )
}

// ─── Page ───────────────────────────────────────────────

export function DealsPage() {
  const { data: hubspot, loading, error } = useHubSpotDeals()
  const [stageFilter, setStageFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('createDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  const allDeals = hubspot?.deals ?? []

  // Computed stats
  const stats = useMemo(() => {
    const active = allDeals.filter(d => !CLOSED_STAGES.includes(d.stageName))
    const won = allDeals.filter(d => d.stageName === 'Closed Won')
    const lost = allDeals.filter(d => d.stageName === 'Closed Lost')
    const activeValue = active.reduce((s, d) => s + (d.amount || 0), 0)
    const totalValue = allDeals.reduce((s, d) => s + (d.amount || 0), 0)
    return {
      activeCount: active.length,
      activeValue,
      wonCount: won.length,
      lostCount: lost.length,
      totalValue,
      totalCount: allDeals.length,
    }
  }, [allDeals])

  // Stage counts for bar
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of allDeals) counts[d.stageName] = (counts[d.stageName] || 0) + 1
    return counts
  }, [allDeals])

  // Filter + search + sort
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
          <div className="text-2xl font-bold text-[#1A3C34]">{formatCurrency(stats.activeValue)}</div>
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
          <div className="text-2xl font-bold text-zinc-900">{formatCurrency(stats.totalValue)}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Total Pipeline Value</div>
        </div>
      </div>

      {/* Pipeline Stage Bar */}
      <div className="mb-5 flex h-3 rounded-full overflow-hidden bg-zinc-100">
        {STAGE_ORDER.map(stage => {
          const count = stageCounts[stage] || 0
          if (count === 0) return null
          const pct = (count / Math.max(stats.totalCount, 1)) * 100
          return (
            <div
              key={stage}
              className={`${BAR_COLORS[stage] || 'bg-zinc-300'} transition-all cursor-pointer hover:opacity-80`}
              style={{ width: `${pct}%` }}
              title={`${stage}: ${count} deals`}
              onClick={() => { setStageFilter(stage); setPage(0) }}
            />
          )
        })}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search deals..."
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-[#1A3C34] focus:outline-none w-72"
          />
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
                  <SortHeader label="Deal Name" sortKey="name" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Stage" sortKey="stageName" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Amount" sortKey="amount" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Close Date" sortKey="closeDate" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Created" sortKey="createDate" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Last Activity" sortKey="lastActivity" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
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
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STAGE_COLORS[d.stageName] || 'bg-zinc-100 text-zinc-600'}`}>
                          {d.stageName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700 text-right font-medium tabular-nums">
                        {d.amount ? `$${d.amount.toLocaleString()}` : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500 text-right">{formatDate(d.closeDate)}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400 text-right">{formatDate(d.createDate)}</td>
                      <td className={`px-4 py-3 text-xs text-right font-medium ${stale ? 'text-red-600' : 'text-zinc-400'}`}>
                        {actDays !== null ? `${actDays}d ago` : '\u2014'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, displayed.length)} of {displayed.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 rounded border border-zinc-200 disabled:opacity-30 hover:bg-zinc-50">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-2 py-1 rounded border border-zinc-200 disabled:opacity-30 hover:bg-zinc-50">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
