import { useState, useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts'
import { useBisonCampaigns, type BisonCampaign } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

type TimeRange = '7d' | '30d' | '90d' | 'all'
type SortKey = 'name' | 'emails_sent' | 'replied' | 'reply_rate' | 'bounce_rate' | 'interested'
type SortDir = 'asc' | 'desc'

function rateColor(rate: number): string {
  if (rate >= 2) return 'text-emerald-600'
  if (rate >= 0.5) return 'text-amber-600'
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

  // Filter: use updated_at to find campaigns with activity in the period
  const filtered = useMemo(() => {
    if (!allData) return []
    let campaigns = allData.campaigns

    if (timeRange !== 'all') {
      const cutoff = timeRange === '7d' ? daysAgo(7) : timeRange === '30d' ? daysAgo(30) : daysAgo(90)
      campaigns = campaigns.filter(c => {
        const updated = c.created_at ? new Date(c.created_at) : null
        const updatedAt = (c as unknown as { updated_at?: string }).updated_at
        const lastActive = updatedAt ? new Date(updatedAt) : updated
        return lastActive && lastActive >= cutoff
      })
    }

    if (statusFilter !== 'all') campaigns = campaigns.filter(c => c.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      campaigns = campaigns.filter(c => c.name.toLowerCase().includes(q))
    }

    return [...campaigns].sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [allData, timeRange, search, sortKey, sortDir, statusFilter])

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

  // Line graph: emails sent by campaign creation month
  const lineData = useMemo(() => {
    if (!allData) return []
    const monthMap: Record<string, { sent: number; replies: number; interested: number; bounced: number }> = {}
    for (const c of allData.campaigns) {
      if (!c.created_at) continue
      const month = c.created_at.slice(0, 7) // YYYY-MM
      if (!monthMap[month]) monthMap[month] = { sent: 0, replies: 0, interested: 0, bounced: 0 }
      monthMap[month].sent += c.emails_sent
      monthMap[month].replies += c.replied
      monthMap[month].interested += c.interested
      monthMap[month].bounced += c.bounced
    }
    return Object.entries(monthMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12) // last 12 months
      .map(([month, v]) => ({
        month: new Date(month + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        'Emails Sent': v.sent,
        Replies: v.replies,
        Interested: v.interested,
      }))
  }, [allData])

  // Top 10 bar chart
  const chartData = useMemo(() => {
    return filtered
      .filter(c => c.emails_sent > 100)
      .sort((a, b) => b.reply_rate - a.reply_rate)
      .slice(0, 10)
      .map(c => ({ name: c.name.length > 30 ? c.name.slice(0, 30) + '...' : c.name, 'Reply %': Math.round(c.reply_rate * 100) / 100 }))
  }, [filtered])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' \u2193' : ' \u2191') : ''

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">{error}</p>

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold text-zinc-900">Email Intelligence</h2>

      {/* Controls */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
          {([['7d', '7 Days'], ['30d', '30 Days'], ['90d', '90 Days'], ['all', 'All Time']] as [TimeRange, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setTimeRange(val)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${timeRange === val ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
              {label}
            </button>
          ))}
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm">
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="paused">Paused</option>
          <option value="stopped">Stopped</option>
          <option value="archived">Archived</option>
        </select>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-yanne focus:outline-none w-56" />

        <span className="text-xs text-zinc-400">
          {totals.count} campaigns
          {timeRange !== 'all' && ' (active in period)'}
        </span>
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

      {/* Charts row */}
      <div className="mb-5 grid grid-cols-2 gap-4">
        {/* Line graph — volume over time */}
        {lineData.length > 1 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">Volume Over Time (by campaign launch month)</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Emails Sent" stroke="#1A3C34" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Replies" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Interested" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Bar chart — top reply rates */}
        {chartData.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">Top 10 by Reply Rate</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 130 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={130} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="Reply %" fill="#1A3C34" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Campaign table */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 sticky top-0">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <th className="text-left px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('name')}>Campaign{sortArrow('name')}</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('emails_sent')}>Sent{sortArrow('emails_sent')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('replied')}>Replies{sortArrow('replied')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('reply_rate')}>Reply %{sortArrow('reply_rate')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('interested')}>Interested{sortArrow('interested')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:text-zinc-700" onClick={() => toggleSort('bounce_rate')}>Bounce %{sortArrow('bounce_rate')}</th>
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

      {/* Detail panel */}
      {selectedCampaign && (
        <div className="mt-4 rounded-lg border border-yanne/20 bg-yanne/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-zinc-900">{selectedCampaign.name}</h3>
            <button onClick={() => setSelectedCampaign(null)} className="text-xs text-zinc-400 hover:text-zinc-600">&times; Close</button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div><div className="text-[10px] text-zinc-500 uppercase">Emails Sent</div><div className="text-lg font-bold text-zinc-900">{selectedCampaign.emails_sent.toLocaleString()}</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Replies</div><div className="text-lg font-bold text-zinc-900">{selectedCampaign.replied}</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Interested</div><div className="text-lg font-bold text-emerald-600">{selectedCampaign.interested}</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Reply Rate</div><div className={`text-lg font-bold ${rateColor(selectedCampaign.reply_rate)}`}>{selectedCampaign.reply_rate.toFixed(2)}%</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Bounce Rate</div><div className={`text-lg font-bold ${selectedCampaign.bounce_rate > 3 ? 'text-red-600' : 'text-zinc-900'}`}>{selectedCampaign.bounce_rate.toFixed(2)}%</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Total Leads</div><div className="text-lg font-bold text-zinc-900">{selectedCampaign.total_leads.toLocaleString()}</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Completion</div><div className="text-lg font-bold text-zinc-900">{selectedCampaign.completion_percentage}%</div></div>
            <div><div className="text-[10px] text-zinc-500 uppercase">Unsubscribed</div><div className="text-lg font-bold text-zinc-900">{selectedCampaign.unsubscribed}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}
