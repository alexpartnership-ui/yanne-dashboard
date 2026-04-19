import { useState } from 'react'
import { useFunnelHealth } from '../hooks/useFunnelHealth'
import { FunnelBars } from '../components/FunnelBars'
import { CohortSelector } from '../components/CohortSelector'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'

const TODAY = new Date().toISOString().slice(0, 10)

interface CohortValue {
  start: string
  end: string
  preset: 'all' | '2025' | '2026_ytd' | 'custom'
}

function msToDays(ms: number | null): string {
  if (ms == null) return '—'
  return (ms / 86_400_000).toFixed(1) + 'd'
}

function formatLastSync(lastSync: string | null): string {
  if (!lastSync) return 'Never synced'
  const diffMs = Date.now() - new Date(lastSync).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) {
    const mins = Math.floor(diffMs / 60_000)
    return `Last synced: ${mins < 1 ? '<1' : mins}m ago`
  }
  return `Last synced: ${hours}h ago`
}

function cohortLabel(cohort: CohortValue): string {
  if (cohort.preset === 'all') return 'All-time'
  if (cohort.preset === '2025') return '2025'
  if (cohort.preset === '2026_ytd') return '2026 YTD'
  return `Custom: ${cohort.start} → ${cohort.end}`
}

export function FunnelHealthPage() {
  const [cohort, setCohort] = useState<CohortValue>({
    preset: '2026_ytd',
    start: '2026-01-01',
    end: TODAY,
  })

  const { counts, dwell, outcomes, lastSync, loading, syncing, error, refetch, triggerSync } = useFunnelHealth({
    cohortStart: cohort.start,
    cohortEnd: cohort.end,
  })

  // --- Derived metrics ---
  const mqToWonPct =
    counts && counts.mq_reach > 0
      ? ((counts.won / counts.mq_reach) * 100).toFixed(1) + '%'
      : '—'

  const biggestLeak = (() => {
    if (!counts) return { label: '—', value: '—' }
    const stages = [
      { from: 'MQ', to: '1st', a: counts.mq_reach, b: counts.first_call_reach },
      { from: '1st', to: '2nd', a: counts.first_call_reach, b: counts.second_call_reach },
      { from: '2nd', to: '3rd', a: counts.second_call_reach, b: counts.third_call_reach },
      { from: '3rd', to: 'Won', a: counts.third_call_reach, b: counts.won },
    ]
    let maxDrop = -1
    let maxLabel = '—'
    let maxPct = '—'
    for (const s of stages) {
      if (s.a === 0) continue
      const drop = ((s.a - s.b) / s.a) * 100
      if (drop > maxDrop) {
        maxDrop = drop
        maxLabel = `${s.from} → ${s.to}`
        maxPct = drop.toFixed(1) + '%'
      }
    }
    return { label: maxLabel, value: maxPct }
  })()

  const ndaUsage =
    counts && counts.mq_reach > 0
      ? ((counts.nda_ever / counts.mq_reach) * 100).toFixed(1) + '%'
      : '—'

  // Longest median stage (for warning highlight)
  const longestMedianStageId = dwell
    .filter(r => r.median_ms != null)
    .reduce<{ id: string | null; ms: number }>(
      (acc, r) => (r.median_ms! > acc.ms ? { id: r.stage_id, ms: r.median_ms! } : acc),
      { id: null, ms: -1 }
    ).id

  // Median total cycle (MQ → 3rd, exclude Won/NDA)
  const cycleStageIds = ['appointmentscheduled', 'presentationscheduled', 'decisionmakerboughtin', '1066193534']
  const medianCycleDays = dwell
    .filter(r => cycleStageIds.includes(r.stage_id) && r.median_ms != null)
    .reduce((sum, r) => sum + (r.median_ms ?? 0) / 86_400_000, 0)

  // Outcomes
  const outcomesTotal = outcomes
    ? outcomes.still + outcomes.won + outcomes.lost + outcomes.ltl + outcomes.dq
    : 0

  const outcomesSegments = outcomes
    ? [
        { key: 'still', label: 'Still', count: outcomes.still, className: 'bg-text-muted' },
        { key: 'won', label: 'Won', count: outcomes.won, className: 'bg-emerald-500' },
        { key: 'lost', label: 'Lost', count: outcomes.lost, className: 'bg-red-500' },
        { key: 'ltl', label: 'LTL', count: outcomes.ltl, className: 'bg-amber-500' },
        { key: 'dq', label: 'DQ', count: outcomes.dq, className: 'bg-red-700' },
      ]
    : []

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Funnel Health — Sales Pipeline</h2>
          <p className="mt-1 text-sm text-text-secondary">{cohortLabel(cohort)}</p>
          <p className="mt-0.5 text-xs text-text-muted">{formatLastSync(lastSync)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CohortSelector value={cohort} onChange={setCohort} />
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-yanne-800/20 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? (
              <svg aria-hidden="true" className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            {syncing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={refetch} className="ml-4 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <Spinner />
      ) : counts && counts.mq_reach === 0 ? (
        <EmptyState
          title="No funnel data yet"
          description="Trigger a sync from the Refresh button to pull snapshots from HubSpot."
        />
      ) : (
        <>
          {/* Section 1 — Funnel */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">Funnel</h3>
            <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm mb-4">
              <FunnelBars counts={counts} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="MQ → Won %" value={mqToWonPct} subtitle="End-to-end conversion" />
              <MetricCard label={`Biggest Leak: ${biggestLeak.label}`} value={biggestLeak.value} subtitle="Largest drop between stages" />
              <MetricCard label="NDA Usage" value={ndaUsage} subtitle="% of deals that ever entered NDA" />
            </div>
          </section>

          {/* Section 2 — Dwell */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">Time in Stage</h3>
            <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">Stage</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Sample</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Median</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Mean</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">P75</th>
                  </tr>
                </thead>
                <tbody>
                  {dwell.map(row => (
                    <tr
                      key={row.stage_id}
                      className={`border-b border-border last:border-0 ${row.stage_id === longestMedianStageId ? 'bg-warning/10' : ''}`}
                    >
                      <td className="px-4 py-2.5 text-text-secondary font-medium">{row.stage_label}</td>
                      <td className="px-4 py-2.5 text-right text-text-muted font-data">{row.sample_count}</td>
                      <td className="px-4 py-2.5 text-right text-text-secondary font-data">{msToDays(row.median_ms)}</td>
                      <td className="px-4 py-2.5 text-right text-text-muted font-data">{msToDays(row.mean_ms)}</td>
                      <td className="px-4 py-2.5 text-right text-text-muted font-data">{msToDays(row.p75_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="Est. Cycle Time (MQ→3rd)"
                value={medianCycleDays > 0 ? medianCycleDays.toFixed(1) + 'd' : '—'}
                subtitle="Sum of stage medians"
              />
            </div>
          </section>

          {/* Section 3 — 3rd Call Outcomes */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
              3rd Call Outcomes — Where Deals End Up
            </h3>
            {outcomes && outcomesTotal > 0 ? (
              <>
                {/* Stacked strip */}
                <div className="flex h-10 w-full overflow-hidden rounded-lg border border-border mb-3">
                  {outcomesSegments.map(seg => {
                    const widthPct = (seg.count / outcomesTotal) * 100
                    return (
                      <div
                        key={seg.key}
                        className={`${seg.className} flex items-center justify-center transition-all`}
                        style={{ width: `${widthPct}%` }}
                      >
                        {widthPct > 8 && (
                          <span className="text-[10px] font-semibold text-white drop-shadow">
                            {seg.count}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-4">
                  {outcomesSegments.map(seg => (
                    <div key={seg.key} className="flex items-center gap-1.5 text-xs">
                      <span className={`h-2.5 w-2.5 rounded-sm ${seg.className}`} />
                      <span className="text-text-muted">{seg.label}</span>
                      <span className="font-semibold text-text-secondary font-data">{seg.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">No 3rd-call outcome data for this cohort.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
