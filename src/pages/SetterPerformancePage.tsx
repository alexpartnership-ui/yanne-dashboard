import { useEffect, useState } from 'react'
import { apiFetch } from '../hooks/useAuth'
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

const COLOR_PALETTE = ['#EF4444', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6']
// Stable color mapping — ensures same setter always gets same color regardless of sort order
const senderColorCache = new Map<string, string>()
function getSetterColor(name: string, index: number): string {
  if (senderColorCache.has(name)) return senderColorCache.get(name)!
  const color = COLOR_PALETTE[index % COLOR_PALETTE.length]
  senderColorCache.set(name, color)
  return color
}

export function SetterPerformancePage() {
  const [data, setData] = useState<SetterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/setter-checkins?days=30')
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error) }))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>
  if (!data) return <p className="text-sm text-text-faint">No data</p>

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
      <h2 className="mb-6 text-2xl font-bold text-text-primary">Setter Performance</h2>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Total Bookings" value={totalBookings} subtitle="Last 30 days" />
        <MetricCard label="Avg / Day" value={avgBookingsPerDay} />
        <MetricCard label="Total Follow-ups" value={totalFollowups} />
        <MetricCard label="Total Replies Handled" value={totalReplies} />
        <MetricCard label="Active Setters" value={setterNames.length} />
      </div>

      {/* Bookings per day chart */}
      <div className="mb-6 rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-text-secondary mb-3">Bookings Per Day (30d)</h3>
        <div className="h-64">
          {chartData.length === 0 ? (
            <p className="text-xs text-text-faint text-center pt-24">No data for this period</p>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(Math.floor(chartData.length / 10), 0)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              {setterNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={getSetterColor(name, i)}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-setter cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {setters
          .sort((a, b) => b[1].totalBookings - a[1].totalBookings)
          .map(([name, s], i) => {
            const avgBookings = s.days > 0 ? (s.totalBookings / s.days).toFixed(1) : '0'
            const avgFollowups = s.days > 0 ? Math.round(s.totalFollowups / s.days) : 0
            const color = getSetterColor(name, i)
            return (
              <div key={name} className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-lg font-bold text-text-primary">{name}</h3>
                  <span className="rounded-full bg-surface-overlay px-2.5 py-0.5 text-xs font-medium text-text-muted">
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
                  <div className="rounded-lg bg-surface-raised p-3">
                    <div className="text-2xl font-bold text-text-secondary">{avgFollowups}</div>
                    <div className="text-[10px] text-text-muted">Avg FU / Day</div>
                  </div>
                </div>

                {/* Last 5 days mini table */}
                <div className="mt-4 pt-3 border-t border-border-muted">
                  <div className="text-[10px] font-semibold text-text-faint uppercase tracking-wider mb-1.5">Recent Days</div>
                  <div className="space-y-1">
                    {s.dailyData.slice(-5).reverse().map(d => (
                      <div key={d.date} className="flex items-center justify-between text-xs">
                        <span className="text-text-muted">{new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <div className="flex gap-3">
                          <span className="text-emerald-600 font-semibold">{d.bookings} booked</span>
                          <span className="text-text-faint">{d.followups} FU</span>
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
