import { useState, useEffect } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { apiFetch } from '../hooks/useAuth'
import { Spinner } from '../components/Spinner'

interface TrackerData {
  totalCalls: number
  topObjections: { text: string; count: number }[]
  topRedFlags: { text: string; count: number }[]
  topCoachingThemes: { text: string; count: number }[]
  topMisses: { text: string; count: number }[]
  weeklyTrends: { week: string; calls: number; avgScore: number; avgObjections: number; redFlags: number; inflation: number }[]
  repBreakdown: { rep: string; calls: number; avgScore: number; objections: number; redFlags: number; inflation: number }[]
}

type TimeRange = '30' | '60' | '90'

function FrequencyList({ title, items, color }: { title: string; items: { text: string; count: number }[]; color: string }) {
  const max = items[0]?.count || 1
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
      <h4 className="text-xs font-bold text-text-primary mb-3">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-text-faint">None tracked</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 8).map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-text-secondary line-clamp-1 flex-1 mr-2">{item.text}</span>
                <span className="text-xs font-bold text-text-muted shrink-0">{item.count}x</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TrackersPage() {
  const [data, setData] = useState<TrackerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<TimeRange>('90')

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/trackers?days=${range}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [range])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-text-faint">Failed to load trackers</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-[#1A3C34]">Call Trackers</h2>
          <p className="text-xs text-text-faint mt-0.5">{data.totalCalls} calls analyzed — patterns, objections, recurring issues</p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['30', '60', '90'] as TimeRange[]).map(v => (
            <button key={v} onClick={() => setRange(v)} className={`px-3 py-1.5 text-xs font-medium ${range === v ? 'bg-[#1A3C34] text-white' : 'bg-surface-raised text-text-muted hover:bg-surface-raised'}`}>
              {v}D
            </button>
          ))}
        </div>
      </div>

      {/* Weekly trend chart */}
      <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm mb-5">
        <h4 className="text-xs font-bold text-text-primary mb-3">Weekly Trends</h4>
        {data.weeklyTrends.length === 0 ? (
          <p className="text-xs text-text-faint text-center py-16">No weekly trend data</p>
        ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.weeklyTrends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={w => typeof w === 'string' ? w.slice(5) : String(w)} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" type="monotone" dataKey="avgScore" name="Avg Score" stroke="#1A3C34" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="calls" name="Calls" stroke="#A8C4BB" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="avgObjections" name="Avg Objections" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Per-rep summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {data.repBreakdown.map(r => (
          <div key={r.rep} className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
            <div className="text-sm font-bold text-text-primary">{r.rep}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div><span className="text-text-faint">Calls:</span> <span className="font-semibold">{r.calls}</span></div>
              <div><span className="text-text-faint">Avg:</span> <span className={`font-semibold ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 55 ? 'text-amber-600' : 'text-red-600'}`}>{r.avgScore}%</span></div>
              <div><span className="text-text-faint">Objections:</span> <span className="font-semibold">{r.objections}</span></div>
              <div><span className="text-text-faint">Red Flags:</span> <span className={`font-semibold ${r.redFlags > 0 ? 'text-red-600' : ''}`}>{r.redFlags}</span></div>
              {r.inflation > 0 && <div className="col-span-2 text-red-600 font-semibold">Pipeline Inflation: {r.inflation}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Frequency lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FrequencyList title="Top Objections" items={data.topObjections} color="bg-amber-500" />
        <FrequencyList title="Top Red Flags" items={data.topRedFlags} color="bg-red-500" />
        <FrequencyList title="Recurring Coaching Themes" items={data.topCoachingThemes} color="bg-[#1A3C34]" />
        <FrequencyList title="Most Common Misses" items={data.topMisses} color="bg-surface-raised0" />
      </div>
    </div>
  )
}
