import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { useDashboardStats } from '../hooks/useDashboardStats'
import { useSlackMeetings } from '../hooks/useSlackMeetings'
import { useRepCheckins } from '../hooks/useRepCheckins'
import { MetricCard } from '../components/MetricCard'
import { GradeDistributionBar } from '../components/GradeDistributionBar'
import { Spinner } from '../components/Spinner'
import { REP_HEX } from '../lib/repColors'

export function AcquisitionDashboard() {
  const { data, loading } = useDashboardStats()
  const { data: meetings } = useSlackMeetings()
  const { data: checkins } = useRepCheckins(30)

  // Build stacked bar chart for calls per day (much cleaner than lines for this data)
  const { barData, allReps } = useMemo(() => {
    if (!checkins?.byDate?.length) {
      if (!data) return { barData: [], allReps: [] }
      const reps = [...new Set(data.callsPerDay.map(d => d.rep))]
      const dayMap: Record<string, Record<string, number>> = {}
      for (const entry of data.callsPerDay) {
        if (!dayMap[entry.date]) dayMap[entry.date] = {}
        dayMap[entry.date][entry.rep] = entry.count
      }
      return {
        barData: Object.entries(dayMap)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, repData]) => ({
            date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            ...repData,
          })),
        allReps: reps,
      }
    }

    const reps = Object.keys(checkins.byRep)
    return {
      barData: checkins.byDate.map(d => {
        const entry: Record<string, string | number> = {
          date: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        }
        for (const rep of reps) {
          entry[rep] = d.reps[rep] ?? 0
        }
        return entry
      }),
      allReps: reps,
    }
  }, [checkins, data])

  // Grade distribution bar data
  const gradeBarData = useMemo(() => {
    if (!data) return []
    return [{
      name: '30d',
      A: data.gradeDistribution.A,
      B: data.gradeDistribution.B,
      C: data.gradeDistribution.C,
      D: data.gradeDistribution.D,
      F: data.gradeDistribution.F,
    }]
  }, [data])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-zinc-400">No data available</p>

  const totalActualCalls = checkins
    ? Object.values(checkins.byRep).reduce((s, r) => s + r.totalCompleted, 0)
    : null

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">Client Acquisition</h2>

      {/* Row 1: Metric Cards */}
      <div className="mb-6 grid grid-cols-6 gap-4">
        <MetricCard
          label="Total Calls"
          value={totalActualCalls ?? data.totalCalls}
          subtitle={totalActualCalls ? 'Last 30d (rep-reported)' : 'Last 30d (scored)'}
        />
        <MetricCard label="Avg Score" value={`${data.avgScore}%`} subtitle="Scored calls" />
        <MetricCard label="Meetings Booked" value={meetings?.thisWeek ?? 0} subtitle={`${meetings?.todaySoFar ?? 0} today \u2022 ${meetings?.avgPerDay ?? 0}/day avg`} />
        <MetricCard label="Active Deals" value={data.activeDeals} subtitle="HubSpot pipeline" />
        <MetricCard label="Close Rate" value="\u2014" placeholder />
        <MetricCard label="Pipeline Value" value="\u2014" placeholder />
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

        {/* Calls Per Day — stacked bar chart */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-1">Calls Per Day (30d)</h3>
          <p className="text-[10px] text-zinc-400 mb-3">
            {checkins?.byDate?.length ? 'Source: Rep daily check-in form' : 'Source: Scored calls'}
          </p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                {allReps.map(rep => (
                  <Bar
                    key={rep}
                    dataKey={rep}
                    stackId="calls"
                    fill={REP_HEX[rep] ?? '#a1a1aa'}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Coaching Themes + Rep Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Coaching Themes — show full text with wrapping */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">Top 5 Coaching Themes (7d)</h3>
          {data.coachingThemes.length === 0 ? (
            <p className="text-xs text-zinc-400">No coaching data this week</p>
          ) : (
            <div className="space-y-2">
              {data.coachingThemes.map((t, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2">
                  <span className="text-xs text-zinc-700 leading-snug">{t.theme}</span>
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-600 shrink-0">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rep Quick Stats */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">
            {checkins?.byRep ? 'Rep Activity (30d check-ins)' : 'Rep Quick Stats (30d)'}
          </h3>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <th className="text-left pb-2">Rep</th>
                <th className="text-right pb-2">Scheduled</th>
                <th className="text-right pb-2">Completed</th>
                <th className="text-right pb-2">Show Rate</th>
                <th className="text-right pb-2">Progressed</th>
                <th className="text-right pb-2">Avg Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {checkins?.byRep ? (
                Object.entries(checkins.byRep)
                  .sort((a, b) => b[1].totalCompleted - a[1].totalCompleted)
                  .map(([rep, s]) => {
                    const scoreData = data.repQuickStats.find(r => r.rep === rep)
                    const showRate = s.totalScheduled > 0 ? Math.round((s.totalCompleted / s.totalScheduled) * 100) : 0
                    return (
                      <tr key={rep}>
                        <td className="py-2 text-sm font-medium text-zinc-800">{rep}</td>
                        <td className="py-2 text-sm text-zinc-600 text-right">{s.totalScheduled}</td>
                        <td className="py-2 text-sm font-semibold text-zinc-900 text-right">{s.totalCompleted}</td>
                        <td className={`py-2 text-sm font-semibold text-right ${showRate >= 80 ? 'text-emerald-600' : showRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{showRate}%</td>
                        <td className="py-2 text-sm text-emerald-600 text-right">{s.totalProgressed}</td>
                        <td className="py-2 text-sm font-semibold text-right">
                          {scoreData ? (
                            <span className={scoreData.avg >= 70 ? 'text-emerald-600' : scoreData.avg >= 55 ? 'text-amber-600' : 'text-red-600'}>
                              {scoreData.avg}%
                            </span>
                          ) : <span className="text-zinc-300">{'\u2014'}</span>}
                        </td>
                      </tr>
                    )
                  })
              ) : (
                data.repQuickStats.map(r => (
                  <tr key={r.rep}>
                    <td className="py-2 text-sm font-medium text-zinc-800">{r.rep}</td>
                    <td className="py-2 text-sm text-zinc-300 text-right">{'\u2014'}</td>
                    <td className="py-2 text-sm text-zinc-600 text-right">{r.calls}</td>
                    <td className="py-2 text-sm text-zinc-300 text-right">{'\u2014'}</td>
                    <td className="py-2 text-sm text-zinc-300 text-right">{'\u2014'}</td>
                    <td className="py-2 text-sm font-semibold text-right">
                      <span className={r.avg >= 70 ? 'text-emerald-600' : r.avg >= 55 ? 'text-amber-600' : 'text-red-600'}>
                        {r.avg}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
