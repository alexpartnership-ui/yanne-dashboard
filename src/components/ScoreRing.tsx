import type { TrendDirection } from '../types/database'

function ringColor(score: number): string {
  if (score >= 75) return '#22c55e'
  if (score >= 55) return '#eab308'
  return '#ef4444'
}

function trendArrow(trend: TrendDirection) {
  if (trend === 'Improving') return <span className="text-emerald-500 text-sm font-bold">↑</span>
  if (trend === 'Declining') return <span className="text-red-500 text-sm font-bold">↓</span>
  return <span className="text-text-faint text-sm">→</span>
}

interface ScoreRingProps {
  label: string
  score: number
  trend: TrendDirection
}

export function ScoreRing({ label, score, trend }: ScoreRingProps) {
  const color = ringColor(score)
  const radius = 36
  const stroke = 5
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(score, 100) / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-20 w-20">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="#f4f4f5" strokeWidth={stroke} />
          <circle
            cx="40" cy="40" r={radius} fill="none"
            stroke={color} strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-text-primary leading-none">{score}%</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <span className="text-[11px] text-text-faint uppercase tracking-wider">{label}</span>
        {trendArrow(trend)}
      </div>
    </div>
  )
}
