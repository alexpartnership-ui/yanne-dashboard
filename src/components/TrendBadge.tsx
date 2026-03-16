import type { TrendDirection } from '../types/database'

const trendConfig: Record<TrendDirection, { icon: string; color: string }> = {
  Improving:   { icon: '\u2191', color: 'text-emerald-600' },
  Plateauing:  { icon: '\u2192', color: 'text-zinc-500' },
  Declining:   { icon: '\u2193', color: 'text-red-600' },
}

export function TrendBadge({ trend }: { trend: TrendDirection }) {
  const cfg = trendConfig[trend]
  return (
    <span className={`text-sm font-medium ${cfg.color}`}>
      {cfg.icon} {trend}
    </span>
  )
}
