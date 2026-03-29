interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  placeholder?: boolean
  accent?: 'default' | 'gold'
  trend?: { value: number; direction: 'up' | 'down' | 'flat' }
  sparkline?: number[]
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const h = 28
  const w = 72
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const lastPoint = data[data.length - 1]
  const lastX = w
  const lastY = h - ((lastPoint - min) / range) * (h - 4) - 2

  return (
    <svg width={w} height={h} className="opacity-50">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-yanne-400"
      />
      <circle cx={lastX} cy={lastY} r={2} className="fill-yanne-400" />
    </svg>
  )
}

function TrendDelta({ value, direction }: { value: number; direction: 'up' | 'down' | 'flat' }) {
  const arrow = direction === 'up' ? '\u2191' : direction === 'down' ? '\u2193' : '\u2192'
  const color = direction === 'up' ? 'text-positive' : direction === 'down' ? 'text-negative' : 'text-text-muted'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium font-data ${color}`}>
      {arrow} {Math.abs(value)}%
    </span>
  )
}

export function MetricCard({ label, value, subtitle, placeholder, accent = 'default', trend, sparkline }: MetricCardProps) {
  return (
    <div className={`card ${accent === 'gold' ? 'card-gold' : ''} p-5 animate-count`}>
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em]">{label}</div>
        {sparkline && sparkline.length > 1 && <MiniSparkline data={sparkline} />}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        {placeholder ? (
          <div className="text-[32px] font-bold leading-none text-text-faint font-data">&mdash;</div>
        ) : (
          <div className="text-[32px] font-bold leading-none text-text-primary font-data tracking-tight">{value}</div>
        )}
        {trend && <TrendDelta value={trend.value} direction={trend.direction} />}
      </div>
      {subtitle && <div className="text-[11px] text-text-muted mt-1.5">{subtitle}</div>}
    </div>
  )
}
