import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

interface SetterSummary {
  totalBookings: number
  totalFollowups: number
  totalReplies: number
  days: number
  dailyData: { date: string; bookings: number; followups: number; replies: number }[]
}

interface DaySummary {
  date: string
  totalBookings: number
  setters: Record<string, number>
}

interface SetterData {
  bySetter: Record<string, SetterSummary>
  byDate: DaySummary[]
}

const SETTER_COLORS: Record<string, string> = {
  'Jenny Lupas': '#EF4444',
  'Paula Sablayan': '#8B5CF6',
  'Pholbert Moreno': '#3B82F6',
}

export function SetterPerformancePage() {
  const [data, setData] = useState<SetterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/setter-checkins?days=30')
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error) }))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>
  if (!data) return <p className="text-sm text-zinc-400">No data</p>

  const setters = Object.entries(data.bySetter)
  const totalBookings = setters.reduce((s, [, v]) => s + v.totalBookings, 0)
  const totalFollowups = setters.reduce((s, [, v]) => s + v.totalFollowups, 0)
  const totalReplies = setters.reduce((s, [, v]) => s + v.totalReplies, 0)
  const totalDays = Math.max(...setters.map(([, v]) => v.days), 1)
  const avgBookingsPerDay = Math.round(totalBookings / totalDays)

  // Chart data — bookings per day per setter
  const chartData = data.byDate.map(d => ({
    date: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    ...d.setters,
  }))
  const setterNames = Object.keys(data.bySetter)

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Setter Performance</h2>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Total Bookings" value={totalBookings} subtitle="Last 30 days" />
        <MetricCard label="Avg / Day" value={avgBookingsPerDay} />
        <MetricCard label="Total Follow-ups" value={totalFollowups} />
        <MetricCard label="Total Replies Handled" value={totalReplies} />
        <MetricCard label="Active Setters" value={setterNames.length} />
      </div>

      {/* Bookings per day chart */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">Bookings Per Day (30d)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              {setterNames.map(name => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={SETTER_COLORS[name] ?? '#a1a1aa'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-setter cards */}
      <div className="grid grid-cols-3 gap-4">
        {setters
          .sort((a, b) => b[1].totalBookings - a[1].totalBookings)
          .map(([name, s]) => {
            const avgBookings = s.days > 0 ? (s.totalBookings / s.days).toFixed(1) : '0'
            const avgFollowups = s.days > 0 ? Math.round(s.totalFollowups / s.days) : 0
            const color = SETTER_COLORS[name] ?? '#71717a'
            return (
              <div key={name} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-lg font-bold text-zinc-900">{name}</h3>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
                    {s.days} days reported
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <div className="text-2xl font-bold text-emerald-700">{s.totalBookings}</div>
                    <div className="text-[10px] text-emerald-600">Total Bookings</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="text-2xl font-bold text-blue-700">{avgBookings}</div>
                    <div className="text-[10px] text-blue-600">Avg / Day</div>
                  </div>
                  <div className="rounded-lg bg-violet-50 p-3">
                    <div className="text-2xl font-bold text-violet-700">{s.totalFollowups}</div>
                    <div className="text-[10px] text-violet-600">Follow-ups Sent</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-2xl font-bold text-zinc-700">{avgFollowups}</div>
                    <div className="text-[10px] text-zinc-500">Avg FU / Day</div>
                  </div>
                </div>

                {/* Last 5 days mini table */}
                <div className="mt-4 pt-3 border-t border-zinc-100">
                  <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Recent Days</div>
                  <div className="space-y-1">
                    {s.dailyData.slice(-5).reverse().map(d => (
                      <div key={d.date} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">{new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <div className="flex gap-3">
                          <span className="text-emerald-600 font-semibold">{d.bookings} booked</span>
                          <span className="text-zinc-400">{d.followups} FU</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
