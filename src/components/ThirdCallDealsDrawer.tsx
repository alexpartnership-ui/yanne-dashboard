import { useEffect, useState } from 'react'
import type { FunnelThirdCallDeal, ThirdCallOutcome } from '../hooks/useFunnelHealth'

interface Props {
  outcome: ThirdCallOutcome | null
  onClose: () => void
  load: (outcome: ThirdCallOutcome) => Promise<FunnelThirdCallDeal[]>
}

const OUTCOME_LABELS: Record<ThirdCallOutcome, string> = {
  all: 'All 3rd Call Deals',
  still: 'Still in 3rd Call',
  won: 'Closed Won',
  lost: 'Closed Lost',
  ltl: 'Long-Term Lead',
  dq: 'Disqualified',
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function hubspotUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/44068147/deal/${dealId}`
}

export function ThirdCallDealsDrawer({ outcome, onClose, load }: Props) {
  const [deals, setDeals] = useState<FunnelThirdCallDeal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!outcome) return
    let cancelled = false
    setLoading(true)
    setError(null)
    load(outcome)
      .then(d => { if (!cancelled) setDeals(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [outcome, load])

  if (!outcome) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-3xl bg-surface shadow-2xl border-l border-border flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary">{OUTCOME_LABELS[outcome]}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {deals.length > 0 && `${deals.length} deals · sorted by dwell in 3rd Call, longest first`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-yanne-800/30 hover:text-text-primary"
            aria-label="Close drawer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-6 text-sm text-text-muted">Loading deals…</div>}
          {error && <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {!loading && !error && deals.length === 0 && (
            <div className="p-6 text-sm text-text-muted">No deals in this bucket for the current cohort.</div>
          )}
          {!loading && !error && deals.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-raised border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Deal</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Closer</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Amount</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Dwell</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(d => {
                  const parker = (d.dwell_days ?? 0) > 14
                  return (
                    <tr key={d.hubspot_deal_id} className={`border-b border-border last:border-0 ${parker ? 'bg-warning/5' : ''}`}>
                      <td className="px-4 py-2.5">
                        <a
                          href={hubspotUrl(d.hubspot_deal_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-text-primary hover:text-gold-400 hover:underline"
                        >
                          {d.dealname || '(unnamed)'}
                        </a>
                        <div className="text-[10px] text-text-faint">{d.current_stage_label}</div>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{d.closer_name}</td>
                      <td className="px-4 py-2.5 text-right font-data text-text-secondary">{formatAmount(d.amount)}</td>
                      <td className={`px-4 py-2.5 text-right font-data ${parker ? 'text-warning' : 'text-text-muted'}`}>
                        {d.dwell_days != null ? `${d.dwell_days.toFixed(1)}d` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-data text-text-muted">{formatDate(d.last_activity_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  )
}
