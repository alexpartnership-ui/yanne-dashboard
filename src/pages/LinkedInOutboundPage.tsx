import { useState } from 'react'
import { useHeyReach, type HeyReachCampaign } from '../hooks/useHeyReach'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    IN_PROGRESS: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active' },
    PAUSED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Paused' },
    COMPLETED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Completed' },
    DRAFT: { bg: 'bg-zinc-100', text: 'text-zinc-500', label: 'Draft' },
  }
  const s = map[status] || { bg: 'bg-zinc-100', text: 'text-zinc-500', label: status }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function completionRate(c: HeyReachCampaign): number {
  if (!c.progressStats || c.progressStats.totalUsers === 0) return 0
  return Math.round((c.progressStats.totalUsersFinished / c.progressStats.totalUsers) * 100)
}

function ProgressBar({ value, max, color = 'bg-yanne' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: HeyReachCampaign }) {
  const [expanded, setExpanded] = useState(false)
  const stats = campaign.progressStats

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-sm font-semibold text-zinc-900 truncate">{campaign.name}</span>
            {statusBadge(campaign.status)}
          </div>
          {stats && (
            <div className="flex items-center gap-4 text-[11px] text-zinc-500">
              <span>{stats.totalUsers.toLocaleString()} leads</span>
              <span>{campaign.campaignAccountIds.length} senders</span>
              <span>{completionRate(campaign)}% complete</span>
              {campaign.linkedInUserListName && (
                <span className="text-zinc-400">List: {campaign.linkedInUserListName}</span>
              )}
            </div>
          )}
        </div>
        <svg className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ml-3 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && stats && (
        <div className="px-5 pb-4 border-t border-zinc-100 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">In Progress</div>
              <div className="text-lg font-bold text-zinc-900">{stats.totalUsersInProgress.toLocaleString()}</div>
              <ProgressBar value={stats.totalUsersInProgress} max={stats.totalUsers} color="bg-blue-500" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Pending</div>
              <div className="text-lg font-bold text-zinc-900">{stats.totalUsersPending.toLocaleString()}</div>
              <ProgressBar value={stats.totalUsersPending} max={stats.totalUsers} color="bg-amber-400" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Finished</div>
              <div className="text-lg font-bold text-emerald-600">{stats.totalUsersFinished.toLocaleString()}</div>
              <ProgressBar value={stats.totalUsersFinished} max={stats.totalUsers} color="bg-emerald-500" />
            </div>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Failed</div>
              <div className="text-lg font-bold text-red-600">{stats.totalUsersFailed.toLocaleString()}</div>
              <ProgressBar value={stats.totalUsersFailed} max={stats.totalUsers} color="bg-red-400" />
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-zinc-400">
            <span>Excluded: {stats.totalUsersExcluded.toLocaleString()}</span>
            <span>Manually stopped: {stats.totalUsersManuallyStopped.toLocaleString()}</span>
            {campaign.startedAt && (
              <span>Started: {new Date(campaign.startedAt).toLocaleDateString()}</span>
            )}
            <span>Created: {new Date(campaign.creationTime).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function LinkedInOutboundPage() {
  const { data, loading, error } = useHeyReach()
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all')

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>
  if (!data) return <div className="p-8 text-zinc-400">No data available</div>

  const filtered = filter === 'all'
    ? data.campaigns
    : data.campaigns.filter(c =>
        filter === 'active' ? c.status === 'IN_PROGRESS'
        : filter === 'paused' ? c.status === 'PAUSED'
        : c.status === 'DRAFT'
      )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900">LinkedIn Outbound</h1>
        <p className="text-sm text-zinc-500 mt-0.5">HeyReach campaign stats and progress — {data.totals.totalCampaigns} campaigns across {data.totals.totalSenderAccounts} LinkedIn accounts</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Campaigns" value={data.totals.totalCampaigns} subtitle={`${data.totals.activeCampaigns} active`} />
        <MetricCard label="Total Leads" value={data.totals.totalLeads.toLocaleString()} />
        <MetricCard label="In Progress" value={data.totals.totalInProgress.toLocaleString()} />
        <MetricCard label="Finished" value={data.totals.totalFinished.toLocaleString()} />
        <MetricCard label="Failed" value={data.totals.totalFailed.toLocaleString()} />
        <MetricCard label="Sender Accounts" value={data.totals.totalSenderAccounts} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(['all', 'active', 'paused', 'draft'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-yanne text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {f === 'all' ? `All (${data.campaigns.length})` :
             f === 'active' ? `Active (${data.campaigns.filter(c => c.status === 'IN_PROGRESS').length})` :
             f === 'paused' ? `Paused (${data.campaigns.filter(c => c.status === 'PAUSED').length})` :
             `Draft (${data.campaigns.filter(c => c.status === 'DRAFT').length})`}
          </button>
        ))}
      </div>

      {/* Campaign list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-sm text-zinc-400 py-8 text-center">No campaigns match this filter</div>
        ) : (
          filtered.map(c => <CampaignRow key={c.id} campaign={c} />)
        )}
      </div>
    </div>
  )
}
