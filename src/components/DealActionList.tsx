import type { AtRiskDeal, WalkingDeadDeal } from '../hooks/useFunnelHealth'

type Row =
  | ({ kind: 'at-risk' } & AtRiskDeal)
  | ({ kind: 'walking-dead' } & WalkingDeadDeal)

interface Props {
  kind: 'at-risk' | 'walking-dead'
  rows: Row[]
  emptyMessage: string
}

function formatAmount(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function hubspotUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/44068147/deal/${dealId}`
}

export function DealActionList({ kind, rows, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-text-muted">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Deal</th>
            <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Closer</th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Retainer</th>
            {kind === 'at-risk' ? (
              <>
                <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Dwell</th>
                <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Risk</th>
              </>
            ) : (
              <>
                <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Days Idle</th>
                <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Last Activity</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const dealId = r.hubspot_deal_id
            return (
              <tr key={dealId} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <a href={hubspotUrl(dealId)} target="_blank" rel="noreferrer"
                     className="text-text-primary hover:text-gold-400 hover:underline">
                    {r.dealname || '(unnamed)'}
                  </a>
                  {r.kind === 'walking-dead' && r.current_stage_label && (
                    <div className="text-[10px] text-text-faint">{r.current_stage_label}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-text-secondary">{r.closer_name}</td>
                <td className="px-4 py-2 text-right font-data text-text-secondary">{formatAmount(r.amount)}</td>
                {r.kind === 'at-risk' ? (
                  <>
                    <td className="px-4 py-2 text-right font-data text-amber-500">
                      {r.dwell_days != null ? `${r.dwell_days.toFixed(1)}d` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-data text-text-primary font-semibold">
                      {r.risk_score != null ? r.risk_score.toFixed(0) : '—'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 text-right font-data text-red-500">
                      {r.days_since_activity != null ? `${r.days_since_activity.toFixed(0)}d` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-data text-text-muted">
                      {formatDate(r.last_activity_at)}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
