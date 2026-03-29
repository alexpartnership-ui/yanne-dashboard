import { useState, useEffect, useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts'
import { apiFetch } from '../hooks/useAuth'
import { Spinner } from '../components/Spinner'

interface BenchmarkData {
  repTrends: { week: string; rep: string; avgScore: number; calls: number }[]
  teamTrend: { week: string; avgScore: number; calls: number }[]
  monthlyGrades: { month: string; A: number; B: number; C: number; D: number; F: number; total: number }[]
  categoryBreakdown: { rep: string; categories: { category: string; avgScore: number }[] }[]
}

const REP_COLORS: Record<string, string> = {
  Jake: '#1A3C34',
  Stanley: '#3B82F6',
  Thomas: '#8B5CF6',
  Tahawar: '#EF4444',
}

export function BenchmarksPage() {
  const [data, setData] = useState<BenchmarkData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/benchmarks')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  // Reshape rep trends into chart-friendly format (one row per week, rep columns)
  const repChartData = useMemo(() => {
    if (!data) return []
    const weekMap: Record<string, Record<string, string | number>> = {}
    for (const t of data.repTrends) {
      if (!weekMap[t.week]) weekMap[t.week] = { week: t.week }
      weekMap[t.week][t.rep] = t.avgScore
    }
    for (const t of data.teamTrend) {
      if (!weekMap[t.week]) weekMap[t.week] = { week: t.week }
      weekMap[t.week]['Team Avg'] = t.avgScore
    }
    return Object.values(weekMap).sort((a, b) => String(a.week).localeCompare(String(b.week)))
  }, [data])

  const reps = useMemo(() => {
    if (!data) return []
    return [...new Set(data.repTrends.map(t => t.rep))]
  }, [data])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-text-faint">Failed to load benchmarks</p>

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[#1A3C34]">Team Benchmarks</h2>
        <p className="text-xs text-text-faint mt-0.5">Performance trends over time — who's improving, who's plateauing</p>
      </div>

      {/* Rep Score Trends */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm mb-5">
        <h4 className="text-sm font-bold text-text-primary mb-1">Weekly Score Trends</h4>
        <p className="text-[10px] text-text-faint mb-3">Average call score per rep by week</p>
        {repChartData.length === 0 ? (
          <p className="text-xs text-text-faint text-center py-12">No trend data available</p>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={repChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={w => typeof w === 'string' ? w.slice(5) : ''} />
            <YAxis domain={['auto', 100]} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {reps.map(rep => (
              <Line key={rep} type="monotone" dataKey={rep} stroke={REP_COLORS[rep] || '#999'} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
            <Line type="monotone" dataKey="Team Avg" stroke="#A8C4BB" strokeWidth={2} strokeDasharray="8 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Grade Distribution Over Time */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm mb-5">
        <h4 className="text-sm font-bold text-text-primary mb-1">Grade Distribution Over Time</h4>
        <p className="text-[10px] text-text-faint mb-3">Monthly breakdown — are we trending toward more A/B grades?</p>
        {data.monthlyGrades.length === 0 ? (
          <p className="text-xs text-text-faint text-center py-12">No grade data available</p>
        ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.monthlyGrades}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="A" stackId="grades" fill="#00875A" />
            <Bar dataKey="B" stackId="grades" fill="#3B82F6" />
            <Bar dataKey="C" stackId="grades" fill="#F59E0B" />
            <Bar dataKey="D" stackId="grades" fill="#F97316" />
            <Bar dataKey="F" stackId="grades" fill="#EF4444" />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Category Performance Heatmap */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
        <h4 className="text-sm font-bold text-text-primary mb-1">Category Performance by Rep</h4>
        <p className="text-[10px] text-text-faint mb-3">Average score per scoring category — find systematic weaknesses</p>
        {data.categoryBreakdown.length === 0 ? (
          <p className="text-xs text-text-faint">No category data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-muted">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-text-faint uppercase">Category</th>
                  {data.categoryBreakdown.map(r => (
                    <th key={r.rep} className="text-center px-3 py-2 text-[10px] font-semibold text-text-faint uppercase">{r.rep}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Get all unique categories */}
                {(() => {
                  const allCats = [...new Set(data.categoryBreakdown.flatMap(r => r.categories.map(c => c.category)))]
                  return allCats.map(cat => (
                    <tr key={cat} className="border-b border-border-muted">
                      <td className="px-3 py-2 text-text-secondary font-medium">{cat}</td>
                      {data.categoryBreakdown.map(r => {
                        const val = r.categories.find(c => c.category === cat)?.avgScore
                        const color = val === undefined ? '' : val >= 75 ? 'bg-emerald-100 text-emerald-800' : val >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        return (
                          <td key={r.rep} className="text-center px-3 py-2">
                            {val !== undefined ? (
                              <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${color}`}>{val}%</span>
                            ) : (
                              <span className="text-text-faint">\u2014</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
