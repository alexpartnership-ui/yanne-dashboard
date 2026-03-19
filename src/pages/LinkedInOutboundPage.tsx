import { useState } from 'react'
import { useHeyReach, type HeyReachCampaign, type HeyReachList, type SenderAccount } from '../hooks/useHeyReach'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'

// ─── Helpers ───────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString() }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtTooltip = (v: any) => fmt(Number(v) || 0)

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    IN_PROGRESS: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active' },
    PAUSED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Paused' },
    COMPLETED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Completed' },
    FINISHED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Finished' },
    DRAFT: { bg: 'bg-zinc-100', text: 'text-zinc-500', label: 'Draft' },
  }
  const s = map[status] || { bg: 'bg-zinc-100', text: 'text-zinc-500', label: status }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text}`}>{s.label}</span>
}

function StatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-20 text-zinc-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right font-medium text-zinc-700">{fmt(value)}</span>
      <span className="w-12 text-right text-zinc-400">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ─── Tabs ──────────────────────────────────────────────

type Tab = 'overview' | 'campaigns' | 'senders' | 'lists'

// ─── Overview Tab ──────────────────────────────────────

function OverviewTab({ campaigns, totals, senders }: {
  campaigns: HeyReachCampaign[]
  totals: NonNullable<ReturnType<typeof useHeyReach>['data']>['totals']
  senders: SenderAccount[]
}) {
  // Top campaigns for bar chart
  const topCampaigns = [...campaigns]
    .filter(c => c.progressStats && c.progressStats.totalUsers > 0)
    .sort((a, b) => (b.progressStats?.totalUsers || 0) - (a.progressStats?.totalUsers || 0))
    .slice(0, 8)
    .map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 18) + '...' : c.name,
      fullName: c.name,
      inProgress: c.progressStats!.totalUsersInProgress,
      finished: c.progressStats!.totalUsersFinished,
      failed: c.progressStats!.totalUsersFailed,
      pending: c.progressStats!.totalUsersPending,
    }))

  // Active senders
  const activeAccountIds = new Set<number>()
  for (const c of campaigns) {
    if (c.status === 'IN_PROGRESS') {
      for (const id of c.campaignAccountIds) activeAccountIds.add(id)
    }
  }
  const activeSenderCount = senders.filter(s => activeAccountIds.has(s.id)).length
  const idleSenderCount = senders.length - activeSenderCount

  return (
    <div className="space-y-6">
      {/* Metric Cards — 2 rows of 4 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Campaigns" value={totals.totalCampaigns} subtitle={`${totals.activeCampaigns} active, ${totals.pausedCampaigns} paused`} />
        <MetricCard label="Total Leads" value={fmt(totals.totalLeads)} subtitle={`${fmt(totals.totalInProgress)} in progress`} />
        <MetricCard label="Completion Rate" value={`${totals.completionRate}%`} subtitle={`${fmt(totals.totalFinished)} finished`} />
        <MetricCard label="Failure Rate" value={`${totals.failureRate}%`} subtitle={`${fmt(totals.totalFailed)} failed`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Sender Accounts" value={totals.totalSenderAccounts} subtitle={`${activeSenderCount} active, ${idleSenderCount} idle`} />
        <MetricCard label="Lead Lists" value={totals.totalLists} subtitle={`${fmt(totals.totalListLeads)} total leads`} />
        <MetricCard label="Pending" value={fmt(totals.totalPending)} subtitle="Waiting to be processed" />
        <MetricCard label="Excluded" value={fmt(totals.totalExcluded)} subtitle="Filtered out" />
      </div>

      {/* Lead Funnel Breakdown */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-800 mb-4">Lead Funnel Breakdown</h3>
        <div className="space-y-2.5">
          <StatBar label="In Progress" value={totals.totalInProgress} total={totals.totalLeads} color="bg-blue-500" />
          <StatBar label="Pending" value={totals.totalPending} total={totals.totalLeads} color="bg-amber-400" />
          <StatBar label="Finished" value={totals.totalFinished} total={totals.totalLeads} color="bg-emerald-500" />
          <StatBar label="Failed" value={totals.totalFailed} total={totals.totalLeads} color="bg-red-400" />
          <StatBar label="Excluded" value={totals.totalExcluded} total={totals.totalLeads} color="bg-zinc-400" />
        </div>
      </div>

      {/* Top Campaigns Bar Chart */}
      {topCampaigns.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-800 mb-4">Top Campaigns by Size</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topCampaigns} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
              <Tooltip formatter={fmtTooltip} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="finished" stackId="a" fill="#10b981" name="Finished" />
              <Bar dataKey="inProgress" stackId="a" fill="#3b82f6" name="In Progress" />
              <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" />
              <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Campaigns Tab ─────────────────────────────────────

function CampaignsTab({ campaigns }: { campaigns: HeyReachCampaign[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'leads' | 'name'>('date')

  const filtered = campaigns
    .filter(c =>
      filter === 'all' ? true
      : filter === 'active' ? c.status === 'IN_PROGRESS'
      : filter === 'paused' ? c.status === 'PAUSED'
      : c.status === 'DRAFT'
    )
    .sort((a, b) => {
      if (sortBy === 'leads') return (b.progressStats?.totalUsers || 0) - (a.progressStats?.totalUsers || 0)
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime()
    })

  const counts = {
    all: campaigns.length,
    active: campaigns.filter(c => c.status === 'IN_PROGRESS').length,
    paused: campaigns.filter(c => c.status === 'PAUSED').length,
    draft: campaigns.filter(c => c.status === 'DRAFT').length,
  }

  return (
    <div className="space-y-4">
      {/* Filters + Sort */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {(['all', 'active', 'paused', 'draft'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-yanne text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span>Sort:</span>
          {(['date', 'leads', 'name'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 rounded capitalize ${sortBy === s ? 'bg-zinc-200 text-zinc-800 font-medium' : 'hover:bg-zinc-100'}`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Campaign List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-sm text-zinc-400 py-8 text-center">No campaigns match this filter</div>
        ) : filtered.map(c => {
          const stats = c.progressStats
          const isExpanded = expandedId === c.id
          const total = stats?.totalUsers || 0

          return (
            <div key={c.id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="flex w-full items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-sm font-semibold text-zinc-900 truncate">{c.name}</span>
                    {statusBadge(c.status)}
                  </div>
                  {stats && total > 0 && (
                    <>
                      <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                        <span>{fmt(total)} leads</span>
                        <span>{c.campaignAccountIds.length} senders</span>
                        <span className="text-emerald-600">{Math.round((stats.totalUsersFinished / total) * 100)}% done</span>
                        {stats.totalUsersFailed > 0 && <span className="text-red-500">{Math.round((stats.totalUsersFailed / total) * 100)}% failed</span>}
                        {c.linkedInUserListName && <span className="text-zinc-400">List: {c.linkedInUserListName}</span>}
                      </div>
                      <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-zinc-100" style={{ maxWidth: 350 }}>
                        <div className="bg-emerald-500 h-full" style={{ width: `${(stats.totalUsersFinished / total) * 100}%` }} />
                        <div className="bg-blue-500 h-full" style={{ width: `${(stats.totalUsersInProgress / total) * 100}%` }} />
                        <div className="bg-amber-400 h-full" style={{ width: `${(stats.totalUsersPending / total) * 100}%` }} />
                        <div className="bg-red-400 h-full" style={{ width: `${(stats.totalUsersFailed / total) * 100}%` }} />
                        <div className="bg-zinc-300 h-full" style={{ width: `${(stats.totalUsersExcluded / total) * 100}%` }} />
                      </div>
                    </>
                  )}
                  {(!stats || total === 0) && (
                    <div className="text-[11px] text-zinc-400">No progress data</div>
                  )}
                </div>
                <svg className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ml-3 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {isExpanded && stats && (
                <div className="px-5 pb-4 border-t border-zinc-100 pt-3">
                  <div className="space-y-2 mb-3">
                    <StatBar label="In Progress" value={stats.totalUsersInProgress} total={total} color="bg-blue-500" />
                    <StatBar label="Pending" value={stats.totalUsersPending} total={total} color="bg-amber-400" />
                    <StatBar label="Finished" value={stats.totalUsersFinished} total={total} color="bg-emerald-500" />
                    <StatBar label="Failed" value={stats.totalUsersFailed} total={total} color="bg-red-400" />
                    <StatBar label="Excluded" value={stats.totalUsersExcluded} total={total} color="bg-zinc-400" />
                    {stats.totalUsersManuallyStopped > 0 && (
                      <StatBar label="Stopped" value={stats.totalUsersManuallyStopped} total={total} color="bg-zinc-500" />
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400 pt-2 border-t border-zinc-50">
                    <span>ID: {c.id}</span>
                    <span>Senders: {c.campaignAccountIds.length}</span>
                    {c.startedAt && <span>Started: {new Date(c.startedAt).toLocaleDateString()}</span>}
                    <span>Created: {new Date(c.creationTime).toLocaleDateString()}</span>
                    {c.linkedInUserListName && <span>List: {c.linkedInUserListName}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Senders Tab ───────────────────────────────────────

function SendersTab({ senders, campaigns }: { senders: SenderAccount[]; campaigns: HeyReachCampaign[] }) {
  const [sortBy, setSortBy] = useState<'campaigns' | 'leads' | 'name'>('campaigns')

  const sorted = [...senders].sort((a, b) => {
    if (sortBy === 'leads') return b.totalLeadsAssigned - a.totalLeadsAssigned
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    return b.campaignCount - a.campaignCount
  })

  const activeAccountIds = new Set<number>()
  for (const c of campaigns) {
    if (c.status === 'IN_PROGRESS') {
      for (const id of c.campaignAccountIds) activeAccountIds.add(id)
    }
  }

  const activeSenders = senders.filter(s => activeAccountIds.has(s.id))
  const idleSenders = senders.filter(s => !activeAccountIds.has(s.id))

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Accounts" value={senders.length} />
        <MetricCard label="Active Now" value={activeSenders.length} subtitle="In running campaigns" />
        <MetricCard label="Idle" value={idleSenders.length} subtitle="No active campaigns" />
        <MetricCard label="Avg Load" value={`${(senders.reduce((s, a) => s + a.campaignCount, 0) / Math.max(senders.length, 1)).toFixed(1)} campaigns`} />
      </div>

      {/* Active / Idle bar */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-zinc-800 mb-3">Account Status</h3>
        <div className="space-y-2">
          <StatBar label="Active" value={activeSenders.length} total={senders.length} color="bg-emerald-500" />
          <StatBar label="Idle" value={idleSenders.length} total={senders.length} color="bg-amber-400" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800">All Sender Accounts ({senders.length})</h3>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Sort:</span>
            {(['campaigns', 'leads', 'name'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 rounded capitalize ${sortBy === s ? 'bg-zinc-200 text-zinc-800 font-medium' : 'hover:bg-zinc-100'}`}
              >{s}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-100">
              <tr>
                <th className="px-4 py-2 font-semibold text-zinc-600">Account</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Status</th>
                <th className="px-4 py-2 font-semibold text-zinc-600 text-right">Campaigns</th>
                <th className="px-4 py-2 font-semibold text-zinc-600 text-right">Est. Leads</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Assigned To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {sorted.map(s => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-800">{s.name}</td>
                  <td className="px-4 py-2">
                    {activeAccountIds.has(s.id) ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    ) : (
                      <span className="text-amber-600 text-[11px]">Idle</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{s.campaignCount}</td>
                  <td className="px-4 py-2 text-right">{fmt(s.totalLeadsAssigned)}</td>
                  <td className="px-4 py-2 text-zinc-500 truncate max-w-[300px]">{s.campaignNames.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Lists Tab ─────────────────────────────────────────

function ListsTab({ lists, campaigns }: { lists: HeyReachList[]; campaigns: HeyReachCampaign[] }) {
  const campaignMap = new Map(campaigns.map(c => [c.id, c.name]))
  const sorted = [...lists].sort((a, b) => b.totalItemsCount - a.totalItemsCount)

  const topLists = sorted.slice(0, 12).map(l => ({
    name: l.name.length > 28 ? l.name.slice(0, 25) + '...' : l.name,
    fullName: l.name,
    leads: l.totalItemsCount,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Lists" value={lists.length} />
        <MetricCard label="Total Leads" value={fmt(lists.reduce((s, l) => s + l.totalItemsCount, 0))} />
        <MetricCard label="Linked to Campaigns" value={lists.filter(l => l.campaignIds.length > 0).length} />
        <MetricCard label="Avg List Size" value={fmt(Math.round(lists.reduce((s, l) => s + l.totalItemsCount, 0) / Math.max(lists.length, 1)))} />
      </div>

      {/* Bar chart */}
      {topLists.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-800 mb-4">Lists by Size</h3>
          <ResponsiveContainer width="100%" height={Math.max(topLists.length * 32, 200)}>
            <BarChart data={topLists} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip formatter={fmtTooltip} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''} />
              <Bar dataKey="leads" fill="#0d9488" name="Leads" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800">All Lists ({lists.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-100">
              <tr>
                <th className="px-4 py-2 font-semibold text-zinc-600">Name</th>
                <th className="px-4 py-2 font-semibold text-zinc-600 text-right">Leads</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Type</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Created</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Campaigns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {sorted.map(l => (
                <tr key={l.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-800 max-w-[300px] truncate">{l.name}</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmt(l.totalItemsCount)}</td>
                  <td className="px-4 py-2 text-zinc-500">{l.listType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-zinc-500">{new Date(l.creationTime).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-zinc-500 truncate max-w-[250px]">
                    {l.campaignIds.length === 0 ? <span className="text-zinc-300">—</span> : l.campaignIds.map(id => campaignMap.get(id) || `#${id}`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────

export function LinkedInOutboundPage() {
  const { data, loading, error } = useHeyReach()
  const [tab, setTab] = useState<Tab>('overview')

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>
  if (!data) return <div className="p-8 text-zinc-400">No data available</div>

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'campaigns', label: 'Campaigns', count: data.totals.totalCampaigns },
    { key: 'senders', label: 'Sender Accounts', count: data.totals.totalSenderAccounts },
    { key: 'lists', label: 'Lead Lists', count: data.totals.totalLists },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">LinkedIn Outbound</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          HeyReach — {data.totals.activeCampaigns} active campaigns, {fmt(data.totals.totalLeads)} total leads, {data.totals.totalSenderAccounts} sender accounts
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-zinc-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-yanne text-yanne'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 text-[10px] bg-zinc-100 text-zinc-500 rounded-full px-1.5 py-0.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab campaigns={data.campaigns} totals={data.totals} senders={data.senders} />}
      {tab === 'campaigns' && <CampaignsTab campaigns={data.campaigns} />}
      {tab === 'senders' && <SendersTab senders={data.senders} campaigns={data.campaigns} />}
      {tab === 'lists' && <ListsTab lists={data.lists} campaigns={data.campaigns} />}
    </div>
  )
}
