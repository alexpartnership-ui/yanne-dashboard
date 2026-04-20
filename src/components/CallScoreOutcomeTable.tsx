import type { CallScoreOutcomeRow } from '../hooks/useFunnelHealth'

interface Props {
  rows: CallScoreOutcomeRow[]
}

const CALL_SLOTS = [1, 2, 3]
const BUCKETS = ['85+', '75-84', '65-74', '55-64', '<55']

function winColor(wonPct: number, sample: number): string {
  if (sample < 3) return 'text-text-faint'
  if (wonPct >= 40) return 'text-emerald-500 font-semibold'
  if (wonPct >= 20) return 'text-amber-500'
  return 'text-red-500'
}

export function CallScoreOutcomeTable({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">Not enough terminal-outcome scored deals yet for correlation.</p>
  }

  // Build lookup: map[call_slot][bucket] → row
  const lookup: Record<number, Record<string, CallScoreOutcomeRow>> = {}
  for (const r of rows) {
    if (!lookup[r.call_slot]) lookup[r.call_slot] = {}
    lookup[r.call_slot][r.score_bucket] = r
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Score Band</th>
            {CALL_SLOTS.map(s => (
              <th key={s} className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Call {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BUCKETS.map(b => (
            <tr key={b} className="border-b border-border last:border-0">
              <td className="px-4 py-2 text-text-secondary font-data">{b}</td>
              {CALL_SLOTS.map(s => {
                const r = lookup[s]?.[b]
                if (!r) {
                  return <td key={s} className="px-4 py-2 text-right text-text-faint font-data">—</td>
                }
                const terminal = r.signed_count + r.lost_count
                return (
                  <td key={s} className="px-4 py-2 text-right font-data">
                    <span className={winColor(r.won_pct, terminal)}>{r.won_pct.toFixed(0)}%</span>
                    <span className="ml-2 text-[10px] text-text-muted">
                      ({r.signed_count}W/{r.lost_count}L)
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-surface px-4 py-2 text-[10px] text-text-faint">
        Cells: Win rate (signed / signed + lost) · Counts: W = signed, L = lost · Green ≥40% · Amber 20–39% · Red &lt;20% · Faded = sample &lt; 3
      </div>
    </div>
  )
}
