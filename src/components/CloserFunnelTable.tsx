import type { FunnelCloserRow } from '../hooks/useFunnelHealth'

interface Props {
  rows: FunnelCloserRow[]
}

function pct(a: number, b: number): string {
  if (!b) return '—'
  return ((a / b) * 100).toFixed(1) + '%'
}

export function CloserFunnelTable({ rows }: Props) {
  if (!rows.length) {
    return <p className="text-sm text-text-muted">No deals assigned to closers in this cohort.</p>
  }

  const totals = rows.reduce(
    (acc, r) => ({
      mq_reach: acc.mq_reach + r.mq_reach,
      first_call_reach: acc.first_call_reach + r.first_call_reach,
      second_call_reach: acc.second_call_reach + r.second_call_reach,
      third_call_reach: acc.third_call_reach + r.third_call_reach,
      won: acc.won + r.won,
      nda_ever: acc.nda_ever + r.nda_ever,
    }),
    { mq_reach: 0, first_call_reach: 0, second_call_reach: 0, third_call_reach: 0, won: 0, nda_ever: 0 },
  )

  const sorted = [...rows].sort((a, b) => b.mq_reach - a.mq_reach)

  const renderRow = (r: FunnelCloserRow | null, isTotal = false) => {
    const d = r ?? { closer_name: 'All', owner_id: 'all', ...totals }
    return (
      <tr
        key={d.owner_id}
        className={`border-b border-border last:border-0 ${isTotal ? 'bg-yanne-800/10 font-semibold' : ''}`}
      >
        <td className="px-3 py-2 text-text-secondary">{d.closer_name}</td>
        <td className="px-3 py-2 text-right font-data text-text-primary">{d.mq_reach}</td>
        <td className="px-3 py-2 text-right font-data text-text-muted">{d.first_call_reach}</td>
        <td className="px-3 py-2 text-right font-data text-text-muted">{d.second_call_reach}</td>
        <td className="px-3 py-2 text-right font-data text-text-muted">{d.third_call_reach}</td>
        <td className="px-3 py-2 text-right font-data text-gold-400">{d.won}</td>
        <td className="px-3 py-2 text-right font-data text-text-secondary">{pct(d.won, d.mq_reach)}</td>
        <td className="px-3 py-2 text-right font-data text-text-muted">{pct(d.won, d.third_call_reach)}</td>
      </tr>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Closer</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">MQ</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">1st+</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">2nd+</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">3rd+</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Won</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">MQ→Won</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">3rd→Won</th>
          </tr>
        </thead>
        <tbody>
          {renderRow(null, true)}
          {sorted.map(r => renderRow(r))}
        </tbody>
      </table>
    </div>
  )
}
