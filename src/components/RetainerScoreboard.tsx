import type { FunnelRetainerScoreboard } from '../hooks/useFunnelHealth'

interface Props {
  data: FunnelRetainerScoreboard | null
}

function formatK(n: number | null | undefined): string {
  if (n == null) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v)}`
}

function delta(current: number | null | undefined, prior: number | null | undefined): { arrow: string; pct: string; color: string } {
  const c = Number(current ?? 0), p = Number(prior ?? 0)
  if (p === 0) {
    if (c > 0) return { arrow: '↑', pct: 'new', color: 'text-emerald-500' }
    return { arrow: '→', pct: '0%', color: 'text-text-muted' }
  }
  const pct = ((c - p) / p) * 100
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)
  if (pct >= 3) return { arrow: '↑', pct: `+${rounded}%`, color: 'text-emerald-500' }
  if (pct <= -3) return { arrow: '↓', pct: `${rounded}%`, color: 'text-red-500' }
  return { arrow: '→', pct: `${rounded}%`, color: 'text-text-muted' }
}

function Card({ label, current, prior, priorLabel }: {
  label: string
  current: number | null | undefined
  prior: number | null | undefined
  priorLabel: string
}) {
  const d = delta(current, prior)
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-data text-[28px] font-bold text-text-primary tracking-tight">{formatK(current)}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${d.color}`}>
          <span>{d.arrow}</span><span className="font-data">{d.pct}</span>
        </span>
      </div>
      <div className="mt-1 text-[10px] text-text-faint font-data">
        {priorLabel}: {formatK(prior)}
      </div>
    </div>
  )
}

export function RetainerScoreboard({ data }: Props) {
  if (!data) {
    return <p className="text-sm text-text-muted">No retainer data yet.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card label="Retainer · Month to Date" current={data.mtd_retainer} prior={data.prev_mtd_retainer} priorLabel="Last month" />
      <Card label="Retainer · Quarter to Date" current={data.qtd_retainer} prior={data.prev_qtd_retainer} priorLabel="Last quarter" />
      <Card label="Retainer · Year to Date" current={data.ytd_retainer} prior={data.prev_ytd_retainer} priorLabel="Last year" />
    </div>
  )
}
