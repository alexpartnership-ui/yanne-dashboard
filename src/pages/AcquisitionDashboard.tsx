import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts'
import { useDashboardStats } from '../hooks/useDashboardStats'
import { useSlackMeetings } from '../hooks/useSlackMeetings'
import { MetricCard } from '../components/MetricCard'
import { GradeDistributionBar } from '../components/GradeDistributionBar'
import { Spinner } from '../components/Spinner'
import { REP_HEX } from '../lib/repColors'

export function AcquisitionDashboard() {
  const { data, loading } = useDashboardStats()
  const { data: meetings } = useSlackMeetings()

  // Build recharts data for grade distribution stacked bar (30d, grouped by week)
  const gradeBarData = useMemo(() => {
    if (!data) return []
    // Just show the grade distribution as a single bar for now — convert to per-week if enough data
    return [
      {
        name: '30d',
        A: data.gradeDistribution.A,
        B: data.gradeDistribution.B,
        C: data.gradeDistribution.C,
        D: data.gradeDistribution.D,
        F: data.gradeDistribution.F,
      },
    ]
  }, [data])

  // Build recharts data for calls per day line chart
  const lineData = useMemo(() => {
    if (!data) return []
    const dayMap: Record<string, Record<string, number>> = {}
    for (const entry of data.callsPerDay) {
      if (!dayMap[entry.date]) dayMap[entry.date] = {}
      dayMap[entry.date][entry.rep] = entry.count
    }
    return Object.entries(dayMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, reps]) => ({
        date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...reps,
      }))
  }, [data])

  const allReps = useMemo(() => {
    if (!data) return []
    return [...new Set(data.callsPerDay.map(d => d.rep))]
  }, [data])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-zinc-400">No data available</p>

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Client Acquisition</h2>

      {/* Row 1: Metric Cards */}
      <div className="mb-6 grid grid-cols-6 gap-4">
        <MetricCard label="Total Calls" value={data.totalCalls} subtitle="Last 30 days" />
        <MetricCard label="Avg Score" value={`${data.avgScore}%`} />
        <MetricCard label="Meetings Booked" value={meetings?.thisWeek ?? 0} subtitle={`${meetings?.todaySoFar ?? 0} today \u2022 ${meetings?.avgPerDay ?? 0}/day avg`} />
        <MetricCard label="Active Deals" value={data.activeDeals} />
        <MetricCard label="Close Rate" value="—" placeholder />
        <MetricCard label="Pipeline Value" value="—" placeholder />
      </div>

      {/* Row 2: Charts */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        {/* Grade Distribution */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-4">Grade Distribution (30d)</h3>
          <div className="mb-4">
            <GradeDistributionBar calls={[
              ...Array(data.gradeDistribution.A).fill({ grade: 'A' }),
              ...Array(data.gradeDistribution.B).fill({ grade: 'B' }),
              ...Array(data.gradeDistribution.C).fill({ grade: 'C' }),
              ...Array(data.gradeDistribution.D).fill({ grade: 'D' }),
              ...Array(data.gradeDistribution.F).fill({ grade: 'F' }),
            ]} />
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeBarData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip />
                <Bar dataKey="A" stackId="a" fill="#166534" name="A" />
                <Bar dataKey="B" stackId="a" fill="#22C55E" name="B" />
                <Bar dataKey="C" stackId="a" fill="#EAB308" name="C" />
                <Bar dataKey="D" stackId="a" fill="#F97316" name="D" />
                <Bar dataKey="F" stackId="a" fill="#EF4444" name="F" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Calls Per Day */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-4">Calls Per Day (14d)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                {allReps.map(rep => (
                  <Line
                    key={rep}
                    type="monotone"
                    dataKey={rep}
                    stroke={REP_HEX[rep] ?? '#a1a1aa'}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Coaching Themes + Rep Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Coaching Themes */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Top 5 Coaching Themes (7d)</h3>
          {data.coachingThemes.length === 0 ? (
            <p className="text-xs text-zinc-400">No coaching data this week</p>
          ) : (
            <div className="space-y-2">
              {data.coachingThemes.map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="text-xs text-zinc-700 leading-snug max-w-[80%]">{t.theme}</span>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rep Quick Stats */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Rep Quick Stats (30d)</h3>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <th className="text-left pb-2">Rep</th>
                <th className="text-right pb-2">Calls</th>
                <th className="text-right pb-2">Avg Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.repQuickStats.map(r => (
                <tr key={r.rep}>
                  <td className="py-2 text-sm font-medium text-zinc-800">{r.rep}</td>
                  <td className="py-2 text-sm text-zinc-600 text-right">{r.calls}</td>
                  <td className="py-2 text-sm font-semibold text-right">
                    <span className={r.avg >= 70 ? 'text-emerald-600' : r.avg >= 55 ? 'text-amber-600' : 'text-red-600'}>
                      {r.avg}%
                    </span>
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
