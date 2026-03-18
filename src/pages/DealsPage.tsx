import { useState } from 'react'
import { useHubSpotDeals } from '../hooks/useHubSpotDeals'
import { Spinner } from '../components/Spinner'
import { ExportButton } from '../components/ExportButton'
import { EmptyState } from '../components/EmptyState'

const HS_ACTIVE_STAGES = ['Meeting Qualified', 'NDA', '1st Closing Call', '2nd Closing Call', '3rd Call / Contract']

function stageColor(stage: string): string {
  if (stage === 'Closed Won') return 'bg-emerald-100 text-emerald-700'
  if (stage === 'Closed Lost' || stage === 'Disqualified') return 'bg-zinc-100 text-zinc-500'
  if (stage === 'Long Term Lead') return 'bg-blue-100 text-blue-700'
  return 'bg-yanne/10 text-yanne'
}

function daysSinceDate(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export function DealsPage() {
  const { data: hubspot, loading, error } = useHubSpotDeals()
  const [stageFilter, setStageFilter] = useState<string>('active')
  const [search, setSearch] = useState('')

  if (loading) return <Spinner />
  if (error) return <div className="text-sm text-red-600">HubSpot: {error}</div>

  const deals = hubspot?.deals ?? []
  const salesDeals = deals.filter(d => d.pipeline === 'default')

  const searched = search
    ? salesDeals.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : salesDeals

  const filtered = stageFilter === 'active'
    ? searched.filter(d => HS_ACTIVE_STAGES.includes(d.stageName))
    : stageFilter === 'all'
    ? searched
    : searched.filter(d => d.stageName === stageFilter)

  const stages = [...new Set(salesDeals.map(d => d.stageName))].sort()
  const activeCount = salesDeals.filter(d => HS_ACTIVE_STAGES.includes(d.stageName)).length
  const wonCount = salesDeals.filter(d => d.stageName === 'Closed Won').length
  const lostCount = salesDeals.filter(d => d.stageName === 'Closed Lost').length
  const activeValue = salesDeals.filter(d => HS_ACTIVE_STAGES.includes(d.stageName)).reduce((s, d) => s + (d.amount || 0), 0)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-yanne">HubSpot Deals</h2>
          <p className="text-xs text-zinc-400">Sales Pipeline — {salesDeals.length} total deals</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton type="deals" />
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 shadow-sm"
          >
            <option value="active">Active Stages ({activeCount})</option>
            <option value="all">All Deals ({salesDeals.length})</option>
            {stages.map(s => {
              const count = salesDeals.filter(d => d.stageName === s).length
              return <option key={s} value={s}>{s} ({count})</option>
            })}
          </select>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search deals..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-yanne focus:outline-none w-72"
        />
        {search && <span className="ml-2 text-xs text-zinc-400">{filtered.length} results</span>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-zinc-900">{activeCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Active Deals</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-yanne">${(activeValue / 1000).toFixed(0)}K</div>
          <div className="text-[11px] text-zinc-500 mt-1">Active Pipeline Value</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-emerald-600">{wonCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Closed Won</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-zinc-400">{lostCount}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Closed Lost</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-zinc-900">${((hubspot?.totalValue ?? 0) / 1000).toFixed(0)}K</div>
          <div className="text-[11px] text-zinc-500 mt-1">Total Pipeline Value</div>
        </div>
      </div>

      {/* Stage breakdown bar */}
      <div className="mb-5 flex gap-1 h-3 rounded-full overflow-hidden bg-zinc-100">
        {HS_ACTIVE_STAGES.map(stage => {
          const count = salesDeals.filter(d => d.stageName === stage).length
          if (count === 0) return null
          const pct = (count / Math.max(salesDeals.length, 1)) * 100
          return (
            <div
              key={stage}
              className="bg-yanne/70 hover:bg-yanne transition-colors cursor-pointer"
              style={{ width: `${pct}%` }}
              title={`${stage}: ${count} deals`}
            />
          )
        })}
        <div
          className="bg-emerald-500"
          style={{ width: `${(wonCount / Math.max(salesDeals.length, 1)) * 100}%` }}
          title={`Closed Won: ${wonCount}`}
        />
        <div
          className="bg-zinc-300"
          style={{ width: `${(lostCount / Math.max(salesDeals.length, 1)) * 100}%` }}
          title={`Closed Lost: ${lostCount}`}
        />
      </div>

      {/* Deal table */}
      {filtered.length === 0 ? (
        <EmptyState title="No deals in this view" description="Try changing the stage filter or search" />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-zinc-50">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  <th className="text-left px-4 py-2.5">Deal Name</th>
                  <th className="text-left px-4 py-2.5">Stage</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-right px-4 py-2.5">Close Date</th>
                  <th className="text-right px-4 py-2.5">Created</th>
                  <th className="text-right px-4 py-2.5">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filtered.map(d => {
                  const activityDays = daysSinceDate(d.lastModified)
                  return (
                    <tr key={d.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-zinc-800">{d.name}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${stageColor(d.stageName)}`}>
                          {d.stageName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700 text-right font-medium">
                        {d.amount ? `$${d.amount.toLocaleString()}` : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500 text-right">
                        {d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 text-right">
                        {d.createDate ? new Date(d.createDate).toLocaleDateString() : '\u2014'}
                      </td>
                      <td className={`px-4 py-3 text-xs text-right ${activityDays !== null && activityDays >= 14 ? 'text-red-600 font-semibold' : 'text-zinc-400'}`}>
                        {activityDays !== null ? `${activityDays}d ago` : '\u2014'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
