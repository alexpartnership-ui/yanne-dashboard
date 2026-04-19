import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import type { FunnelMonthlyCohort } from '../hooks/useFunnelHealth'

interface Props {
  rows: FunnelMonthlyCohort[]
}

function formatMonth(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function MonthlyCohortTrend({ rows }: Props) {
  if (!rows.length) {
    return <p className="text-sm text-text-muted">No monthly cohort data yet.</p>
  }

  const data = rows.map(r => ({
    month: formatMonth(r.cohort_month),
    mq_count: r.mq_count,
    won_pct: r.won_pct,
    is_immature: r.is_immature,
  }))

  const firstImmatureIdx = data.findIndex(d => d.is_immature)

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3F3A" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fill: '#9CA6A1', fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: '#9CA6A1', fontSize: 11 }} label={{ value: 'MQ count', angle: -90, position: 'insideLeft', fill: '#9CA6A1', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#D4AF63', fontSize: 11 }} unit="%" label={{ value: 'Won %', angle: 90, position: 'insideRight', fill: '#D4AF63', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#0D1F1B', border: '1px solid #2A3F3A', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#D4AF63' }}
              formatter={(v, name) => name === 'won_pct' ? `${v}%` : v}
            />
            {firstImmatureIdx >= 0 && (
              <ReferenceLine yAxisId="left" x={data[firstImmatureIdx].month} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'Maturing →', fill: '#F59E0B', fontSize: 10, position: 'top' }} />
            )}
            <Bar yAxisId="left" dataKey="mq_count" fill="#4F8A7B" name="MQ" radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="won_pct" stroke="#D4AF63" strokeWidth={2} dot={{ r: 3, fill: '#D4AF63' }} name="Won %" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[10px] text-text-faint">
        Bars: deals that entered MQ in each month. Line: % of those that have closed-won so far. Months inside the dashed region are still maturing (younger than typical MQ→Won cycle); their Won % will rise as deals progress.
      </p>
    </div>
  )
}
