import type { TrendDirection } from '../types/database'
import { TrendBadge } from './TrendBadge'

interface StatCardProps {
  label: string
  value: string | number
  trend?: TrendDirection
}

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
      {trend && (
        <div className="mt-1">
          <TrendBadge trend={trend} />
        </div>
      )}
    </div>
  )
}
