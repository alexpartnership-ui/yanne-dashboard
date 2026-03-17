import { useState, useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend, AreaChart, Area } from 'recharts'
import { useSlackEmailReports } from '../hooks/useSlackEmailReports'
import { useBisonCampaigns, type BisonCampaign } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

type TimeRange = '7d' | '14d' | '30d'
type SortKey = 'name' | 'emails_sent' | 'replied' | 'reply_rate' | 'bounce_rate' | 'interested'
type SortDir = 'asc' | 'desc'
type Tab = 'overview' | 'campaigns'

function rateColor(rate: number): string {
  if (rate >= 2) return 'text-emerald-600'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}

export function EmailIntelligencePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const days = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30
  const { data: slackData, loading: loadingS } = useSlackEmailReports(days)
  const { data: bisonData, loading: loadingB } = useBisonCampaigns()
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('emails_sent')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedCampaign, setSelectedCampaign] = useState<BisonCampaign | null>(null)

  // Line chart data from Slack daily reports
  const lineData = useMemo(() => {
    if (!slackData) return []
    return slackData.dailyReports.map(r => ({
      date: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      'Emails Sent': r.emailsSent,
      Replies: r.replies,
      Interested: r.interested,
      Bounced: r.bounced,
    }))
  }, [slackData])

  // Reply rate trend
  const rateTrend = useMemo(() => {
    if (!slackData) return []
    return slackData.dailyReports
      .filter(r => r.emailsSent > 0)
      .map(r => ({
        date: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        'Reply Rate': Math.round(r.replyRate * 100) / 100,
        'Bounce Rate': Math.round(r.bounceRate * 100) / 100,
      }))
  }, [slackData])

  // Campaign table (Bison)
  const filteredCampaigns = useMemo(() => {
    if (!bisonData) return []
    let campaigns = bisonData.campaigns
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
  }, [bisonData, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' \u2193' : ' \u2191') : ''

  if (loadingS && loadingB) return <Spinner />

  const t = slackData?.totals

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-zinc-900">Email Intelligence</h2>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden mr-2">
            <button onClick={() => setTab('overview')} className={`px-3 py-1.5 text-xs font-medium ${tab === 'overview' ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>Daily Overview</button>
            <button onClick={() => setTab('campaigns')} className={`px-3 py-1.5 text-xs font-medium ${tab === 'campaigns' ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>Campaigns</button>
          </div>
          {/* Time range */}
          <div className="flex rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
            {([['7d', '7 Days'], ['14d', '14 Days'], ['30d', '30 Days']] as [TimeRange, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setTimeRange(val)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${timeRange === val ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── OVERVIEW TAB (Slack daily reports) ─── */}
      {tab === 'overview' && (
        <>
          {/* Metrics from Slack */}
          <div className="mb-5 grid grid-cols-6 gap-3">
            <MetricCard label="Emails Sent" value={(t?.emailsSent ?? 0).toLocaleString()} subtitle={`${days}d total`} />
            <MetricCard label="People Contacted" value={(t?.peopleContacted ?? 0).toLocaleString()} />
            <MetricCard label="Reply Rate" value={`${(t?.replyRate ?? 0).toFixed(2)}%`} />
            <MetricCard label="Replies" value={(t?.replies ?? 0).toLocaleString()} />
            <MetricCard label="Interested" value={(t?.interested ?? 0).toLocaleString()} subtitle={`${(t?.interestedPct ?? 0).toFixed(0)}% of replies`} />
            <MetricCard label="Bounce Rate" value={`${(t?.bounceRate ?? 0).toFixed(2)}%`} />
          </div>

          {/* Charts */}
          <div className="mb-5 grid grid-cols-2 gap-4">
            {/* Volume line chart */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">Daily Volume</h3>
              <div className="h-56">
                {lineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={lineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="Emails Sent" stroke="#1A3C34" fill="#1A3C34" fillOpacity={0.1} strokeWidth={2} />
                      <Area type="monotone" dataKey="Replies" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={2} />
                      <Area type="monotone" dataKey="Interested" stroke="#22C55E" fill="#22C55E" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-zinc-400 text-center pt-20">No data for this period</p>}
              </div>
            </div>

            {/* Rate trend */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">Rate Trends</h3>
              <div className="h-56">
                {rateTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rateTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="Reply Rate" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="Bounce Rate" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-xs text-zinc-400 text-center pt-20">No data</p>}
              </div>
            </div>
          </div>

          {/* Daily breakdown table */}
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-right px-3 py-2">Sent</th>
                    <th className="text-right px-3 py-2">Contacted</th>
                    <th className="text-right px-3 py-2">Replies</th>
                    <th className="text-right px-3 py-2">Reply %</th>
                    <th className="text-right px-3 py-2">Interested</th>
                    <th className="text-right px-3 py-2">Int %</th>
                    <th className="text-right px-3 py-2">Bounced</th>
                    <th className="text-right px-3 py-2">Bounce %</th>
                    <th className="text-right px-3 py-2">Mailboxes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {[...(slackData?.dailyReports ?? [])].reverse().map(r => (
                    <tr key={r.date} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 text-xs font-medium text-zinc-800">{new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600 text-right">{r.emailsSent.toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600 text-right">{r.peopleContacted.toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs text-zinc-600 text-right">{r.replies}</td>
                      <td className={`px-3 py-2 text-xs font-semibold text-right ${rateColor(r.replyRate)}`}>{r.replyRate.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-xs text-emerald-600 text-right font-semibold">{r.interested}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500 text-right">{r.interestedPct.toFixed(0)}%</td>
                      <td className="px-3 py-2 text-xs text-zinc-600 text-right">{r.bounced}</td>
                      <td className={`px-3 py-2 text-xs text-right ${r.bounceRate > 2 ? 'text-red-600 font-semibold' : 'text-zinc-400'}`}>{r.bounceRate.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-xs text-zinc-400 text-right">{r.activeMailboxes.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── CAMPAIGNS TAB (Bison data) ─── */}
      {tab === 'campaigns' && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..."
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-yanne focus:outline-none w-56" />
            <span className="text-xs text-zinc-400">{filteredCampaigns.length} campaigns (all-time from Bison)</span>
          </div>

          {/* Top campaigns chart */}
          {filteredCampaigns.length > 0 && (
            <div className="mb-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-700 mb-3">Top 10 by Reply Rate</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredCampaigns.filter(c => c.emails_sent > 100).sort((a, b) => b.reply_rate - a.reply_rate).slice(0, 10)
                      .map(c => ({ name: c.name.length > 30 ? c.name.slice(0, 30) + '...' : c.name, 'Reply %': Math.round(c.reply_rate * 100) / 100 }))}
                    layout="vertical" margin={{ left: 130 }}>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filteredCampaigns.map(c => (
                    <tr key={c.id} onClick={() => setSelectedCampaign(selectedCampaign?.id === c.id ? null : c)}
                      className={`hover:bg-zinc-50 cursor-pointer ${selectedCampaign?.id === c.id ? 'bg-yanne/5' : ''}`}>
                      <td className="px-3 py-2.5 text-sm text-zinc-800 max-w-[300px] truncate">{c.name}</td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : c.status === 'completed' ? 'bg-zinc-100 text-zinc-600' : c.status === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{c.status}</span></td>
                      <td className="px-3 py-2.5 text-xs text-zinc-600 text-right">{c.emails_sent.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-600 text-right">{c.replied}</td>
                      <td className={`px-3 py-2.5 text-xs font-semibold text-right ${rateColor(c.reply_rate)}`}>{c.reply_rate.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-xs text-emerald-600 text-right font-semibold">{c.interested}</td>
                      <td className={`px-3 py-2.5 text-xs text-right ${c.bounce_rate > 3 ? 'text-red-600' : 'text-zinc-400'}`}>{c.bounce_rate.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
        </>
      )}
    </div>
  )
}
