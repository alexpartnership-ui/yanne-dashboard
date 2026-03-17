interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  placeholder?: boolean
}

export function MetricCard({ label, value, subtitle, placeholder }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      {placeholder ? (
        <div className="text-[36px] font-bold leading-tight text-zinc-200">—</div>
      ) : (
        <div className="text-[36px] font-bold leading-tight text-zinc-900">{value}</div>
      )}
      {subtitle && <div className="text-xs text-zinc-400 mt-0.5">{subtitle}</div>}
    </div>
  )
}
