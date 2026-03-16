import type { TrendDirection } from '../types/database'

function barColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 65) return 'bg-yellow-400'
  if (score >= 50) return 'bg-orange-400'
  return 'bg-red-500'
}

function trendArrow(trend: TrendDirection) {
  if (trend === 'Improving') return <span className="text-emerald-500 text-lg">↑</span>
  if (trend === 'Declining') return <span className="text-red-500 text-lg">↓</span>
  return <span className="text-zinc-400 text-lg">→</span>
}

interface ScoreBarProps {
  label: string
  score: number
  trend: TrendDirection
}

export function ScoreBar({ label, score, trend }: ScoreBarProps) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-4xl font-bold text-zinc-900 tabular-nums leading-none">{score}%</span>
        {trendArrow(trend)}
      </div>
      <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full transition-all ${barColor(score)}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
    </div>
  )
}
