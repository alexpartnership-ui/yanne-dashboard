import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList, Cell } from 'recharts'
import type { FunnelCounts } from '../hooks/useFunnelHealth'

interface Props {
  counts: FunnelCounts | null
}

const STAGES = [
  { key: 'mq_reach', label: 'MQ' },
  { key: 'first_call_reach', label: '1st Call+' },
  { key: 'second_call_reach', label: '2nd Call+' },
  { key: 'third_call_reach', label: '3rd Call+' },
  { key: 'won', label: 'Won' },
] as const

const BAR_FILL = '#4F8A7B'
const GOLD_FILL = '#D4AF63'

function pct(a: number, b: number): string {
  if (b === 0) return '0.0%'
  return ((a / b) * 100).toFixed(1) + '%'
}

export function FunnelBars({ counts }: Props) {
  if (!counts) return null

  const values: number[] = [
    counts.mq_reach,
    counts.first_call_reach,
    counts.second_call_reach,
    counts.third_call_reach,
    counts.won,
  ]

  const maxVal = values[0] || 1

  const data = STAGES.map((stage, i) => ({
    label: stage.label,
    count: values[i],
    // Normalize so MQ bar fills 100% of its domain
    value: values[i],
  }))

  // Conversion % labels between adjacent stages
  const conversionLabels = [
    { label: `MQ → 1st`, pct: pct(counts.first_call_reach, counts.mq_reach) },
    { label: `1st → 2nd`, pct: pct(counts.second_call_reach, counts.first_call_reach) },
    { label: `2nd → 3rd`, pct: pct(counts.third_call_reach, counts.second_call_reach) },
    { label: `3rd → Won`, pct: pct(counts.won, counts.third_call_reach) },
  ]

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
          <XAxis type="number" domain={[0, maxVal]} hide />
          <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={36}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.label === 'Won' ? GOLD_FILL : BAR_FILL} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fontSize: 12, fill: '#6B7280', fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Conversion % table below chart */}
      <div className="flex items-center gap-4 flex-wrap px-2">
        {conversionLabels.map(cl => (
          <div key={cl.label} className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">{cl.label}</span>
            <span className="font-semibold text-text-secondary font-data">↓ {cl.pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
