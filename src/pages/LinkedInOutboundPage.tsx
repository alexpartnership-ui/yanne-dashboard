import { useState, useMemo } from 'react'
import { useHeyReach, type HeyReachCampaign, type HeyReachList, type SenderAccount } from '../hooks/useHeyReach'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, ComposedChart, Area, Line } from 'recharts'

// ─── Helpers ───────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtTooltip = (v: any) => fmt(Number(v) || 0)

function fmt(n: number) { return n.toLocaleString() }


// ─── Tabs ──────────────────────────────────────────────

type Tab = 'overview' | 'campaigns' | 'senders' | 'lists'

// ─── Overview Tab ──────────────────────────────────────

function OverviewTab({ campaigns, totals, senders }: {
  campaigns: HeyReachCampaign[]
  totals: ReturnType<typeof useHeyReach>['data'] extends infer D ? D extends { totals: infer T } ? T : never : never
  senders: SenderAccount[]
}) {
  // Campaign status breakdown for pie chart
  const statusData = [
    { name: 'Active', value: totals.activeCampaigns, color: '#10b981' },
    { name: 'Paused', value: totals.pausedCampaigns, color: '#f59e0b' },
    { name: 'Draft', value: totals.draftCampaigns, color: '#a1a1aa' },
    { name: 'Completed', value: totals.completedCampaigns, color: '#3b82f6' },
  ].filter(d => d.value > 0)

  // Lead funnel breakdown for pie chart
  const funnelData = [
    { name: 'In Progress', value: totals.totalInProgress, color: '#3b82f6' },
    { name: 'Pending', value: totals.totalPending, color: '#f59e0b' },
    { name: 'Finished', value: totals.totalFinished, color: '#10b981' },
    { name: 'Failed', value: totals.totalFailed, color: '#ef4444' },
    { name: 'Excluded', value: totals.totalExcluded, color: '#a1a1aa' },
  ].filter(d => d.value > 0)

  // Campaign size bar chart (top 10 by total leads)
  const topCampaigns = [...campaigns]
    .filter(c => c.progressStats)
    .sort((a, b) => (b.progressStats?.totalUsers || 0) - (a.progressStats?.totalUsers || 0))
    .slice(0, 10)
    .map(c => ({
      name: c.name.length > 25 ? c.name.slice(0, 22) + '...' : c.name,
      fullName: c.name,
      leads: c.progressStats!.totalUsers,
      inProgress: c.progressStats!.totalUsersInProgress,
      finished: c.progressStats!.totalUsersFinished,
      failed: c.progressStats!.totalUsersFailed,
      pending: c.progressStats!.totalUsersPending,
    }))

  // Campaign timeline (stacked area — leads by creation date)
  const timelineMap = new Map<string, { date: string; leads: number; campaigns: number }>()
  for (const c of campaigns) {
    const date = c.creationTime.slice(0, 10)
    const existing = timelineMap.get(date) || { date, leads: 0, campaigns: 0 }
    existing.leads += c.progressStats?.totalUsers || 0
    existing.campaigns++
    timelineMap.set(date, existing)
  }
  const timelineData = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Sender workload distribution
  const senderWorkload = useMemo(() => {
    const buckets = [
      { range: '1 campaign', count: 0 },
      { range: '2-3 campaigns', count: 0 },
      { range: '4-5 campaigns', count: 0 },
      { range: '6+ campaigns', count: 0 },
    ]
    for (const s of senders) {
      if (s.campaignCount === 1) buckets[0].count++
      else if (s.campaignCount <= 3) buckets[1].count++
      else if (s.campaignCount <= 5) buckets[2].count++
      else buckets[3].count++
    }
    return buckets
  }, [senders])

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MetricCard label="Campaigns" value={totals.totalCampaigns} subtitle={`${totals.activeCampaigns} active`} />
        <MetricCard label="Total Leads" value={fmt(totals.totalLeads)} />
        <MetricCard label="In Progress" value={fmt(totals.totalInProgress)} />
        <MetricCard label="Pending" value={fmt(totals.totalPending)} />
        <MetricCard label="Finished" value={fmt(totals.totalFinished)} subtitle={`${totals.completionRate}%`} />
        <MetricCard label="Failed" value={fmt(totals.totalFailed)} subtitle={`${totals.failureRate}% rate`} />
        <MetricCard label="Sender Accounts" value={totals.totalSenderAccounts} />
        <MetricCard label="Lead Lists" value={totals.totalLists} subtitle={`${fmt(totals.totalListLeads)} leads`} />
      </div>

      {/* Charts Row 1: Status Pie + Funnel Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Campaign Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3} label={({ name, value }) => `${name}: ${value}`} labelLine={false} style={{ fontSize: 11 }}>
                {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Lead Funnel Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={funnelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2} label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`} labelLine={false} style={{ fontSize: 10 }}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip formatter={fmtTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2: Top Campaigns Bar + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Top 10 Campaigns by Size</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topCampaigns} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={fmtTooltip} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="inProgress" stackId="a" fill="#3b82f6" name="In Progress" />
              <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" />
              <Bar dataKey="finished" stackId="a" fill="#10b981" name="Finished" />
              <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Campaign Creation Timeline</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={timelineData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip formatter={fmtTooltip} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Area yAxisId="left" type="monotone" dataKey="leads" fill="#0d948820" stroke="#0d9488" name="Leads Added" />
              <Line yAxisId="right" type="monotone" dataKey="campaigns" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Campaigns Created" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sender Workload Distribution */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800 mb-3">Sender Account Workload Distribution</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={senderWorkload}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis dataKey="range" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#0d9488" name="Accounts" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
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

  return (
    <div className="space-y-4">
      {/* Filters + Sort */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {(['all', 'active', 'paused', 'draft'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f ? 'bg-yanne text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {f === 'all' ? `All (${campaigns.length})` :
               f === 'active' ? `Active (${campaigns.filter(c => c.status === 'IN_PROGRESS').length})` :
               f === 'paused' ? `Paused (${campaigns.filter(c => c.status === 'PAUSED').length})` :
               `Draft (${campaigns.filter(c => c.status === 'DRAFT').length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span>Sort:</span>
          {(['date', 'leads', 'name'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2 py-0.5 rounded ${sortBy === s ? 'bg-zinc-200 text-zinc-800 font-medium' : 'hover:bg-zinc-100'}`}
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
          const completionPct = stats && stats.totalUsers > 0 ? Math.round((stats.totalUsersFinished / stats.totalUsers) * 100) : 0
          const failPct = stats && stats.totalUsers > 0 ? Math.round((stats.totalUsersFailed / stats.totalUsers) * 100) : 0

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
                  {stats && (
                    <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                      <span>{fmt(stats.totalUsers)} leads</span>
                      <span>{c.campaignAccountIds.length} senders</span>
                      <span className="text-emerald-600">{completionPct}% done</span>
                      {failPct > 0 && <span className="text-red-500">{failPct}% failed</span>}
                      {c.linkedInUserListName && <span className="text-zinc-400">List: {c.linkedInUserListName}</span>}
                    </div>
                  )}
                  {stats && (
                    <div className="mt-2 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-zinc-100" style={{ maxWidth: 300 }}>
                      <div className="bg-emerald-500 h-full" style={{ width: `${(stats.totalUsersFinished / stats.totalUsers) * 100}%` }} />
                      <div className="bg-blue-500 h-full" style={{ width: `${(stats.totalUsersInProgress / stats.totalUsers) * 100}%` }} />
                      <div className="bg-amber-400 h-full" style={{ width: `${(stats.totalUsersPending / stats.totalUsers) * 100}%` }} />
                      <div className="bg-red-400 h-full" style={{ width: `${(stats.totalUsersFailed / stats.totalUsers) * 100}%` }} />
                      <div className="bg-zinc-300 h-full" style={{ width: `${(stats.totalUsersExcluded / stats.totalUsers) * 100}%` }} />
                    </div>
                  )}
                </div>
                <svg className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ml-3 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {isExpanded && stats && (
                <div className="px-5 pb-4 border-t border-zinc-100 pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
                    {[
                      { label: 'Total Leads', value: stats.totalUsers, color: 'text-zinc-900' },
                      { label: 'In Progress', value: stats.totalUsersInProgress, color: 'text-blue-600' },
                      { label: 'Pending', value: stats.totalUsersPending, color: 'text-amber-600' },
                      { label: 'Finished', value: stats.totalUsersFinished, color: 'text-emerald-600' },
                      { label: 'Failed', value: stats.totalUsersFailed, color: 'text-red-600' },
                      { label: 'Excluded', value: stats.totalUsersExcluded, color: 'text-zinc-500' },
                      { label: 'Stopped', value: stats.totalUsersManuallyStopped, color: 'text-zinc-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">{label}</div>
                        <div className={`text-lg font-bold ${color}`}>{fmt(value)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-zinc-400 pt-2 border-t border-zinc-50">
                    <span>ID: {c.id}</span>
                    <span>Senders: {c.campaignAccountIds.length}</span>
                    {c.startedAt && <span>Started: {new Date(c.startedAt).toLocaleDateString()}</span>}
                    <span>Created: {new Date(c.creationTime).toLocaleDateString()}</span>
                    {c.linkedInUserListId > 0 && <span>List ID: {c.linkedInUserListId}</span>}
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

  // Which accounts are in active campaigns?
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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Accounts" value={senders.length} />
        <MetricCard label="Active Now" value={activeSenders.length} subtitle="In running campaigns" />
        <MetricCard label="Idle / Inactive" value={idleSenders.length} subtitle="Not in active campaigns" />
        <MetricCard label="Avg Campaigns/Account" value={(senders.reduce((s, a) => s + a.campaignCount, 0) / Math.max(senders.length, 1)).toFixed(1)} />
      </div>

      {/* Active vs Idle visual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Account Activity Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Active', value: activeSenders.length, color: '#10b981' },
                  { name: 'Idle', value: idleSenders.length, color: '#f59e0b' },
                ]}
                dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}
                label={({ name, value }) => `${name}: ${value}`} labelLine={false} style={{ fontSize: 11 }}
              >
                <Cell fill="#10b981" />
                <Cell fill="#f59e0b" />
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-800 mb-3">Campaign Load per Account</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sorted.slice(0, 20).map(s => ({
              id: s.name,
              campaigns: s.campaignCount,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="id" tick={{ fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="campaigns" fill="#0d9488" name="Campaigns" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sort + Table */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800">All Sender Accounts ({senders.length})</h3>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span>Sort:</span>
            {(['campaigns', 'leads', 'name'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 rounded ${sortBy === s ? 'bg-zinc-200 text-zinc-800 font-medium' : 'hover:bg-zinc-100'}`}
              >{s}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-100">
              <tr>
                <th className="px-4 py-2 font-semibold text-zinc-600">Account</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Status</th>
                <th className="px-4 py-2 font-semibold text-zinc-600 text-right">Campaigns</th>
                <th className="px-4 py-2 font-semibold text-zinc-600 text-right">~Leads Assigned</th>
                <th className="px-4 py-2 font-semibold text-zinc-600">Campaigns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {sorted.map(s => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 font-medium text-zinc-800">{s.name}</td>
                  <td className="px-4 py-2">
                    {activeAccountIds.has(s.id) ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                      </span>
                    ) : (
                      <span className="text-amber-600">Idle</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{s.campaignCount}</td>
                  <td className="px-4 py-2 text-right">{fmt(s.totalLeadsAssigned)}</td>
                  <td className="px-4 py-2 text-zinc-500 truncate max-w-[250px]">{s.campaignNames.join(', ')}</td>
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

  const topLists = sorted.slice(0, 15).map(l => ({
    name: l.name.length > 30 ? l.name.slice(0, 27) + '...' : l.name,
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
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-800 mb-3">Lead Lists by Size</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={topLists} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
            <Tooltip formatter={fmtTooltip} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''} />
            <Bar dataKey="leads" fill="#0d9488" name="Leads" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800">All Lists ({lists.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
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
                  <td className="px-4 py-2 text-zinc-500">{l.listType.replace('_', ' ')}</td>
                  <td className="px-4 py-2 text-zinc-500">{new Date(l.creationTime).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-zinc-500 truncate max-w-[250px]">
                    {l.campaignIds.length === 0 ? <span className="text-zinc-300">None</span> : l.campaignIds.map(id => campaignMap.get(id) || `#${id}`).join(', ')}
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
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900">LinkedIn Outbound</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          HeyReach — {data.totals.activeCampaigns} active campaigns, {fmt(data.totals.totalLeads)} total leads, {data.totals.totalSenderAccounts} sender accounts
        </p>
      </div>

      {/* Tabs */}
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

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab campaigns={data.campaigns} totals={data.totals} senders={data.senders} />}
      {tab === 'campaigns' && <CampaignsTab campaigns={data.campaigns} />}
      {tab === 'senders' && <SendersTab senders={data.senders} campaigns={data.campaigns} />}
      {tab === 'lists' && <ListsTab lists={data.lists} campaigns={data.campaigns} />}
    </div>
  )
}
