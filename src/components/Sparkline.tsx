import { ResponsiveContainer, AreaChart, Area, Tooltip, ScatterChart, Scatter, YAxis } from 'recharts'
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
}

export function Sparkline({ data, callType }: SparklineProps) {
  const filtered = data.filter(d => d.call_type === callType).slice(-10)

  // < 2 points: show gray text
  if (filtered.length < 2) {
    return <div className="h-10 text-xs text-zinc-300 flex items-center">&lt; 5 calls</div>
  }

  // 2-4 points: dots only (no line)
  if (filtered.length < 5) {
    const color = strokeColor(filtered)
    return (
      <div className="h-10 w-full mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis dataKey="score" hide domain={[0, 100]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="rounded bg-zinc-800 px-2 py-1 text-xs text-white shadow">
                    {(payload[0].payload as CallPoint).score}%
                  </div>
                )
              }}
            />
            <Scatter data={filtered} fill={color} r={3} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // 5+ points: full area chart
  const color = strokeColor(filtered)

  return (
    <div className="h-10 w-full mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filtered} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`fill-${callType}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="rounded bg-zinc-800 px-2 py-1 text-xs text-white shadow">
                  {payload[0].value}%
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#fill-${callType})`}
            dot={false}
            activeDot={{ r: 3, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
