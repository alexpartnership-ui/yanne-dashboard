import { useState, useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useBisonCampaigns, type BisonCampaign } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

type TimeRange = '7d' | '30d' | '90d' | 'all'
type SortKey = 'name' | 'emails_sent' | 'replied' | 'reply_rate' | 'bounce_rate' | 'interested'
type SortDir = 'asc' | 'desc'

function rateColor(rate: number, thresholds: [number, number] = [0.5, 2]): string {
  if (rate >= thresholds[1]) return 'text-emerald-600'
  if (rate >= thresholds[0]) return 'text-amber-600'
  return 'text-red-600'
}

function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}

export function EmailIntelligencePage() {
  const { data: allData, loading, error } = useBisonCampaigns()
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('emails_sent')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedCampaign, setSelectedCampaign] = useState<BisonCampaign | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Filter campaigns by time range + search + status
  const filtered = useMemo(() => {
    if (!allData) return []
    let campaigns = allData.campaigns

    // Time filter
    if (timeRange !== 'all') {
      const cutoff = timeRange === '7d' ? daysAgo(7) : timeRange === '30d' ? daysAgo(30) : daysAgo(90)
      campaigns = campaigns.filter(c => c.created_at && new Date(c.created_at) >= cutoff)
    }

    // Status filter
    if (statusFilter !== 'all') {
      campaigns = campaigns.filter(c => c.status === statusFilter)
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      campaigns = campaigns.filter(c => c.name.toLowerCase().includes(q))
    }

    // Sort
    campaigns = [...campaigns].sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

    return campaigns
  }, [allData, timeRange, search, sortKey, sortDir, statusFilter])

  // Totals for filtered set
  const totals = useMemo(() => {
    const totalSent = filtered.reduce((s, c) => s + c.emails_sent, 0)
    const totalReplied = filtered.reduce((s, c) => s + c.replied, 0)
    const totalInterested = filtered.reduce((s, c) => s + c.interested, 0)
    const totalBounced = filtered.reduce((s, c) => s + c.bounced, 0)
    const active = filtered.filter(c => c.status === 'active' || c.status === 'launching').length
    const avgReply = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0
    const avgBounce = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0
    return { totalSent, totalReplied, totalInterested, totalBounced, active, avgReply, avgBounce, count: filtered.length }
  }, [filtered])

  // Top 10 by reply rate for chart
  const chartData = useMemo(() => {
    return filtered
      .filter(c => c.emails_sent > 100)
      .sort((a, b) => b.reply_rate - a.reply_rate)
      .slice(0, 10)
      .map(c => ({ name: c.name.length > 25 ? c.name.slice(0, 25) + '...' : c.name, reply_rate: Math.round(c.reply_rate * 100) / 100, interested: c.interested }))
  }, [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    return (
      <th className="px-3 py-2 text-right cursor-pointer hover:text-zinc-700 select-none" onClick={() => toggleSort(field)}>
        {label} {sortKey === field ? (sortDir === 'desc' ? '\u2193' : '\u2191') : ''}
      </th>
    )
  }

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold text-zinc-900">Email Intelligence</h2>

      {/* Controls */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        {/* Time range */}
        <div className="flex rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
          {([['7d', '7 Days'], ['30d', '30 Days'], ['90d', '90 Days'], ['all', 'All Time']] as [TimeRange, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setTimeRange(val)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${timeRange === val ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="paused">Paused</option>
          <option value="stopped">Stopped</option>
          <option value="archived">Archived</option>
        </select>

        {/* Search */}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-yanne focus:outline-none w-56" />

        <span className="text-xs text-zinc-400">{totals.count} campaigns</span>
      </div>

      {/* Metrics */}
      <div className="mb-5 grid grid-cols-6 gap-3">
        <MetricCard label="Campaigns" value={totals.count} subtitle={`${totals.active} active`} />
        <MetricCard label="Emails Sent" value={totals.totalSent.toLocaleString()} />
        <MetricCard label="Reply Rate" value={`${totals.avgReply.toFixed(2)}%`} />
        <MetricCard label="Total Replies" value={totals.totalReplied.toLocaleString()} />
        <MetricCard label="Interested" value={totals.totalInterested.toLocaleString()} />
        <MetricCard label="Bounce Rate" value={`${totals.avgBounce.toFixed(2)}%`} />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="mb-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Top 10 by Reply Rate</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="reply_rate" fill="#1A3C34" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Campaign table */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 sticky top-0">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <th className="text-left px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('name')}>
                  Campaign {sortKey === 'name' ? (sortDir === 'desc' ? '\u2193' : '\u2191') : ''}
                </th>
                <th className="text-left px-3 py-2">Status</th>
                <SortHeader label="Sent" field="emails_sent" />
                <SortHeader label="Replies" field="replied" />
                <SortHeader label="Reply %" field="reply_rate" />
                <SortHeader label="Interested" field="interested" />
                <SortHeader label="Bounce %" field="bounce_rate" />
                <th className="text-right px-3 py-2">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map(c => (
                <tr key={c.id}
                  onClick={() => setSelectedCampaign(selectedCampaign?.id === c.id ? null : c)}
                  className={`hover:bg-zinc-50 transition-colors cursor-pointer ${selectedCampaign?.id === c.id ? 'bg-yanne/5' : ''}`}>
                  <td className="px-3 py-2.5 text-sm text-zinc-800 max-w-[300px] truncate">{c.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      c.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      c.status === 'completed' ? 'bg-zinc-100 text-zinc-600' :
                      c.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                      c.status === 'stopped' ? 'bg-red-100 text-red-700' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>{c.status}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600 text-right">{c.emails_sent.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600 text-right">{c.replied}</td>
                  <td className={`px-3 py-2.5 text-xs font-semibold text-right ${rateColor(c.reply_rate)}`}>{c.reply_rate.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-xs text-emerald-600 text-right font-semibold">{c.interested}</td>
                  <td className={`px-3 py-2.5 text-xs text-right ${c.bounce_rate > 3 ? 'text-red-600 font-semibold' : 'text-zinc-400'}`}>{c.bounce_rate.toFixed(2)}%</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400 text-right">{c.total_leads.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign detail panel */}
      {selectedCampaign && (
        <div className="mt-4 rounded-lg border border-yanne/20 bg-yanne/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-zinc-900">{selectedCampaign.name}</h3>
            <button onClick={() => setSelectedCampaign(null)} className="text-xs text-zinc-400 hover:text-zinc-600">&times; Close</button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Emails Sent</div>
              <div className="text-lg font-bold text-zinc-900">{selectedCampaign.emails_sent.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Unique Opens</div>
              <div className="text-lg font-bold text-zinc-900">{selectedCampaign.unique_opens.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Replies</div>
              <div className="text-lg font-bold text-zinc-900">{selectedCampaign.replied}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Interested</div>
              <div className="text-lg font-bold text-emerald-600">{selectedCampaign.interested}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Reply Rate</div>
              <div className={`text-lg font-bold ${rateColor(selectedCampaign.reply_rate)}`}>{selectedCampaign.reply_rate.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Bounce Rate</div>
              <div className={`text-lg font-bold ${selectedCampaign.bounce_rate > 3 ? 'text-red-600' : 'text-zinc-900'}`}>{selectedCampaign.bounce_rate.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Leads</div>
              <div className="text-lg font-bold text-zinc-900">{selectedCampaign.total_leads.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Completion</div>
              <div className="text-lg font-bold text-zinc-900">{selectedCampaign.completion_percentage}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
