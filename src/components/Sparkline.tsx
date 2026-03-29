import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts'
import type { CallPoint } from '../hooks/useRepCallHistory'

function strokeColor(points: CallPoint[]): string {
  if (points.length < 2) return '#a1a1aa'
  const last = points[points.length - 1].score
  const first = points[0].score
  if (last > first + 3) return '#22c55e'
  if (last < first - 3) return '#ef4444'
  return '#a1a1aa'
}

interface SparklineProps {
  data: CallPoint[]
  callType: string
  rep?: string
}

export function Sparkline({ data, callType, rep = '' }: SparklineProps) {
  const filtered = data.filter(d => d.call_type === callType).slice(-25)

  if (filtered.length < 2) {
    return <div className="h-10 text-xs text-text-faint flex items-center">&lt; 2 calls</div>
  }

  const color = strokeColor(filtered)
  const gradientId = `fill-${rep}-${callType}-${filtered.length}`.replace(/\s/g, '')

  return (
    <div className="h-10 w-full mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filtered} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const pt = payload[0].payload as CallPoint
              return (
                <div className="rounded bg-surface px-2 py-1 text-xs text-white shadow">
                  {pt.score}% — {pt.date?.slice(5) || 'N/A'}
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 2, fill: color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
