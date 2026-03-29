import { useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { useDashboardStats } from '../hooks/useDashboardStats'
import { useSlackMeetings } from '../hooks/useSlackMeetings'
import { useRepCheckins } from '../hooks/useRepCheckins'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'
import { REP_HEX } from '../lib/repColors'

const GRADE_FILLS: Record<string, string> = {
  A: '#166534', B: '#22C55E', C: '#EAB308', D: '#F97316', F: '#EF4444',
}

function GradeTrack({ dist }: { dist: Record<string, number> }) {
  const total = Object.values(dist).reduce((s, v) => s + v, 0)
  if (!total) return null
  return (
    <div className="grade-track">
      {(['A', 'B', 'C', 'D', 'F'] as const).map(g => {
        const pct = (dist[g] / total) * 100
        if (!dist[g]) return null
        return (
          <div key={g} className="grade-segment" style={{ width: pct + '%', background: GRADE_FILLS[g] }} title={g + ': ' + dist[g] + ' (' + pct.toFixed(0) + '%)'}>
            {pct > 8 ? g + ' ' + dist[g] : g}
          </div>
        )
      })}
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
  return (
    <div className="rounded-lg border border-border bg-yanne-950 px-3 py-2 shadow-xl">
      <div className="text-[10px] font-data text-yanne-300 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-yanne-200">{p.dataKey}</span>
          <span className="font-data text-white ml-auto">{p.value}</span>
        </div>
      ))}
      <div className="mt-1 pt-1 border-t border-yanne-700 text-[10px] font-data text-gold-300 text-right">
        Total: {total}
      </div>
    </div>
  )
}

export function AcquisitionDashboard() {
  const { data, loading } = useDashboardStats()
  const { data: meetings } = useSlackMeetings()
  const { data: checkins } = useRepCheckins(30)

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
        for (const rep of reps) entry[rep] = d.reps[rep] ?? 0
        return entry
      }),
      allReps: reps,
    }
  }, [checkins, data])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-text-muted">No data available</p>

  const totalActualCalls = checkins
    ? Object.values(checkins.byRep).reduce((s, r) => s + r.totalCompleted, 0)
    : null

  const heroValue = totalActualCalls ?? data.totalCalls
  const pipelineStr = data.pipelineValue >= 1000000
    ? '$' + (data.pipelineValue / 1000000).toFixed(1) + 'M'
    : '$' + (data.pipelineValue / 1000).toFixed(0) + 'k'

  return (
    <div className="-m-6">
      {/* === HERO KPI STRIP === */}
      <div className="bg-yanne-950 px-6 pt-5 pb-6">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Client Acquisition</h2>
            <p className="text-[10px] text-yanne-400 font-data mt-0.5">
              30-DAY PERFORMANCE &middot; {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-positive pulse-live" />
            <span className="text-[9px] text-yanne-400 font-data uppercase">
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3 reveal-hero">
          <div className="col-span-3 kpi-hero p-5 flex flex-col justify-between">
            <div className="text-[9px] font-semibold text-yanne-300 uppercase tracking-[0.12em]">Total Calls</div>
            <div className="mt-2">
              <div className="text-[56px] font-bold leading-none text-white font-data tracking-tighter">{heroValue}</div>
              <div className="text-[10px] text-yanne-400 mt-1.5">
                {totalActualCalls ? 'Rep-reported' : 'Scored'} &middot; 30d
              </div>
            </div>
          </div>

          <div className="col-span-9 grid grid-cols-4 gap-3 reveal-satellites">
            <div className="kpi-satellite kpi-satellite-green p-4">
              <div className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.1em]">Avg Score</div>
              <div className="text-[28px] font-bold leading-none text-text-primary font-data tracking-tight mt-2">{data.avgScore}<span className="text-[16px] text-text-muted">%</span></div>
              <div className="text-[10px] text-text-faint mt-1">Scored calls</div>
            </div>
            <div className="kpi-satellite kpi-satellite-blue p-4">
              <div className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.1em]">Meetings</div>
              <div className="text-[28px] font-bold leading-none text-text-primary font-data tracking-tight mt-2">{meetings?.thisWeek ?? 0}</div>
              <div className="text-[10px] text-text-faint mt-1">{meetings?.todaySoFar ?? 0} today &middot; {meetings?.avgPerDay ?? 0}/day</div>
            </div>
            <div className="kpi-satellite kpi-satellite-green p-4">
              <div className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.1em]">Active Deals</div>
              <div className="text-[28px] font-bold leading-none text-text-primary font-data tracking-tight mt-2">{data.activeDeals}</div>
              <div className="text-[10px] text-text-faint mt-1">HubSpot pipeline</div>
            </div>
            <div className="kpi-satellite kpi-satellite-gold p-4">
              <div className="text-[9px] font-semibold text-gold-500 uppercase tracking-[0.1em]">Pipeline</div>
              <div className="text-[28px] font-bold leading-none text-gold-500 font-data tracking-tight mt-2">{pipelineStr}</div>
              <div className="text-[10px] text-text-faint mt-1">Weighted avg</div>
            </div>
          </div>
        </div>
      </div>
      {/* === ANALYTICAL GRID === */}
      <div className="px-6 pt-5 pb-6">
        <div className="panel reveal-panel-1 mb-4">
          <div className="panel-header">
            <span className="text-[12px] font-semibold text-text-primary">Grade Distribution</span>
            <span className="text-[9px] font-data text-text-faint uppercase">30d &middot; {Object.values(data.gradeDistribution).reduce((s, v) => s + v, 0)} calls</span>
          </div>
          <div className="px-5 py-4">
            <GradeTrack dist={data.gradeDistribution} />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-4">
          <div className="col-span-3 panel reveal-panel-2">
            <div className="panel-header">
              <span className="text-[12px] font-semibold text-text-primary">Daily Call Volume</span>
              <span className="text-[9px] font-data text-text-faint uppercase">
                {checkins?.byDate?.length ? 'Check-in form' : 'Scored calls'}
              </span>
            </div>
            <div className="p-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-muted)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--color-text-faint)', fontFamily: 'var(--font-data)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} angle={-45} textAnchor="end" height={45} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: 'var(--color-text-faint)', fontFamily: 'var(--font-data)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-surface-overlay)' }} />
                  {allReps.map(rep => (
                    <Bar key={rep} dataKey={rep} stackId="calls" fill={REP_HEX[rep] ?? '#6b8f82'} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="px-5 pb-3 flex gap-4">
              {allReps.map(rep => (
                <div key={rep} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: REP_HEX[rep] ?? '#6b8f82' }} />
                  <span className="text-[10px] text-text-muted">{rep}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 panel reveal-panel-3">
            <div className="panel-header">
              <span className="text-[12px] font-semibold text-text-primary">
                {checkins?.byRep ? 'Rep Activity' : 'Rep Stats'}
              </span>
              <span className="text-[9px] font-data text-text-faint uppercase">30d</span>
            </div>
            <div className="p-0">
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Rep</th>
                    {checkins?.byRep && <th>Sched</th>}
                    <th>Done</th>
                    {checkins?.byRep && <th>Show%</th>}
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {checkins?.byRep ? (
                    Object.entries(checkins.byRep)
                      .sort((a, b) => b[1].totalCompleted - a[1].totalCompleted)
                      .map(([rep, s]) => {
                        const scoreData = data.repQuickStats.find(r => r.rep === rep)
                        const showRate = s.totalScheduled > 0 ? Math.round((s.totalCompleted / s.totalScheduled) * 100) : 0
                        return (
                          <tr key={rep}>
                            <td>{rep}</td>
                            <td>{s.totalScheduled}</td>
                            <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{s.totalCompleted}</td>
                            <td style={{ color: showRate >= 80 ? 'var(--color-positive)' : showRate >= 60 ? 'var(--color-warning)' : 'var(--color-negative)' }}>{showRate}%</td>
                            <td style={{ color: scoreData && scoreData.avg >= 70 ? 'var(--color-positive)' : scoreData && scoreData.avg >= 55 ? 'var(--color-warning)' : 'var(--color-negative)' }}>
                              {scoreData ? scoreData.avg + '%' : '—'}
                            </td>
                          </tr>
                        )
                      })
                  ) : (
                    data.repQuickStats.map(r => (
                      <tr key={r.rep}>
                        <td>{r.rep}</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{r.calls}</td>
                        <td style={{ color: r.avg >= 70 ? 'var(--color-positive)' : r.avg >= 55 ? 'var(--color-warning)' : 'var(--color-negative)' }}>{r.avg}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel reveal-panel-4">
          <div className="panel-header">
            <span className="text-[12px] font-semibold text-text-primary">Coaching Priorities</span>
            <span className="text-[9px] font-data text-text-faint uppercase">7d &middot; Top 5</span>
          </div>
          {data.coachingThemes.length === 0 ? (
            <div className="px-5 py-4 text-[11px] text-text-faint">No coaching data this week</div>
          ) : (
            <div>
              {data.coachingThemes.map((t, i) => (
                <div key={i} className="coaching-item">
                  <span className="coaching-rank">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[11px] text-text-secondary leading-snug flex-1">{t.theme}</span>
                  <span className="font-data text-[11px] font-semibold text-yanne-500">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
