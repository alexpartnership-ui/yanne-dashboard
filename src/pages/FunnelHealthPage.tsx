import { useState } from 'react'
import { useFunnelHealth, type ThirdCallOutcome } from '../hooks/useFunnelHealth'
import { FunnelBars } from '../components/FunnelBars'
import { CohortSelector } from '../components/CohortSelector'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { MonthlyCohortTrend } from '../components/MonthlyCohortTrend'
import { CloserFunnelTable } from '../components/CloserFunnelTable'
import { ThirdCallDealsDrawer } from '../components/ThirdCallDealsDrawer'
import { RetainerScoreboard } from '../components/RetainerScoreboard'
import { DealActionList } from '../components/DealActionList'
import { CallScoreOutcomeTable } from '../components/CallScoreOutcomeTable'

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

function formatLastSync(lastSync: string | null): { text: string; colorClass: string } {
  if (!lastSync) return { text: 'Never synced', colorClass: 'text-red-500' }
  const diffMs = Date.now() - new Date(lastSync).getTime()
  const hours = diffMs / 3_600_000
  let text: string
  if (hours < 1) {
    const mins = Math.floor(diffMs / 60_000)
    text = `Last synced: ${mins < 1 ? '<1' : mins}m ago`
  } else {
    text = `Last synced: ${Math.floor(hours)}h ago`
  }
  const colorClass =
    hours < 24 ? 'text-emerald-500'
    : hours < 48 ? 'text-amber-500'
    : 'text-red-500'
  return { text, colorClass }
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

  const {
    counts, dwell, outcomes, cycles, byCloser, monthlyCohorts, dwellByOutcome,
    retainerScoreboard, retainerByStage, atRisk, walkingDead, callScoreOutcome,
    lastSync, loading, syncing, error, refetch, triggerSync, loadThirdCallDeals,
  } = useFunnelHealth({
    cohortStart: cohort.start,
    cohortEnd: cohort.end,
  })
  const [drillOutcome, setDrillOutcome] = useState<ThirdCallOutcome | null>(null)

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
          <p className={`mt-0.5 text-xs font-medium ${formatLastSync(lastSync).colorClass}`}>{formatLastSync(lastSync).text}</p>
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

      {/* Retainer Scoreboard — always visible, not cohort-bound */}
      <section className="mb-8">
        <RetainerScoreboard data={retainerScoreboard} />
      </section>

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
          {/* Section — At-Risk 3rd Call deals (intervention window) */}
          <section className="mb-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-text-muted">
                At-Risk — 3rd Call past 15d
              </h3>
              <span className="text-[11px] text-text-faint">
                {atRisk.length} {atRisk.length === 1 ? 'deal needs' : 'deals need'} attention · sorted by risk (retainer × days over)
              </span>
            </div>
            <DealActionList
              kind="at-risk"
              rows={atRisk.map(d => ({ kind: 'at-risk' as const, ...d }))}
              emptyMessage="No 3rd Call deals past the 15-day threshold. Clean slate."
            />
          </section>

          {/* Section 0 — Monthly cohort trend (selectivity over time) */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
              MQ → Won by Cohort Month — last 12 months
            </h3>
            <MonthlyCohortTrend rows={monthlyCohorts} />
          </section>

          {/* Section 1 — Funnel */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">Funnel</h3>
            <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm mb-4">
              <FunnelBars counts={counts} />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MetricCard label="MQ → Won %" value={mqToWonPct} subtitle="End-to-end conversion" />
              <MetricCard
                label="Won Retainer ($)"
                value={retainerByStage?.won_retainer != null
                  ? '$' + (retainerByStage.won_retainer / 1000).toFixed(0) + 'K'
                  : '—'}
                subtitle="This cohort, retainer collected"
                accent="gold"
              />
              <MetricCard label={`Biggest Leak: ${biggestLeak.label}`} value={biggestLeak.value} subtitle="Largest drop between stages" />
              <MetricCard label="NDA Usage" value={ndaUsage} subtitle="% of deals that ever entered NDA" />
            </div>
          </section>

          {/* Section 1b — Per-closer breakdown */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
              By Closer
            </h3>
            <CloserFunnelTable rows={byCloser} />
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
          </section>

          {/* Section 2b — End-to-end Cycle Times */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
              End-to-end Cycle Times
            </h3>
            {cycles.length === 0 ? (
              <p className="text-sm text-text-muted">No cycle data for this cohort.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {cycles.map(c => (
                  <div
                    key={c.segment_id}
                    className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                      {c.segment_label}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-data text-2xl font-bold text-text-primary">
                        {c.median_days != null ? c.median_days.toFixed(1) : '—'}
                      </span>
                      <span className="text-xs text-text-muted">days median</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted font-data">
                      <span>mean {c.mean_days != null ? c.mean_days.toFixed(1) + 'd' : '—'}</span>
                      <span>p75 {c.p75_days != null ? c.p75_days.toFixed(1) + 'd' : '—'}</span>
                      <span className="ml-auto">n={c.sample_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 3 — 3rd Call Outcomes */}
          <section className="mb-8">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
              3rd Call Outcomes — Where Deals End Up
            </h3>
            <p className="mb-3 text-[11px] text-text-faint">Click any segment to audit the underlying deals.</p>
            {outcomes && outcomesTotal > 0 ? (
              <>
                {/* Stacked strip — each segment is a button */}
                <div className="flex h-10 w-full overflow-hidden rounded-lg border border-border mb-3">
                  {outcomesSegments.map(seg => {
                    const widthPct = (seg.count / outcomesTotal) * 100
                    if (seg.count === 0) return null
                    return (
                      <button
                        key={seg.key}
                        onClick={() => setDrillOutcome(seg.key as ThirdCallOutcome)}
                        className={`${seg.className} flex items-center justify-center transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface focus:ring-gold-400`}
                        style={{ width: `${widthPct}%` }}
                        aria-label={`View ${seg.label} deals (${seg.count})`}
                      >
                        {widthPct > 8 && (
                          <span className="text-[10px] font-semibold text-white drop-shadow">
                            {seg.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-4">
                  {outcomesSegments.map(seg => (
                    <button
                      key={seg.key}
                      onClick={() => setDrillOutcome(seg.key as ThirdCallOutcome)}
                      disabled={seg.count === 0}
                      className="flex items-center gap-1.5 text-xs hover:text-gold-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-muted"
                    >
                      <span className={`h-2.5 w-2.5 rounded-sm ${seg.className}`} />
                      <span className="text-text-muted">{seg.label}</span>
                      <span className="font-semibold text-text-secondary font-data">{seg.count}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">No 3rd-call outcome data for this cohort.</p>
            )}
          </section>
        </>
      )}

      {!loading && counts && counts.mq_reach > 0 && walkingDead.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-text-muted">
              Walking Dead — no activity 30+ days
            </h3>
            <span className="text-[11px] text-text-faint">
              {walkingDead.length} zombie {walkingDead.length === 1 ? 'deal' : 'deals'} · kill or revive
            </span>
          </div>
          <DealActionList
            kind="walking-dead"
            rows={walkingDead.map(d => ({ kind: 'walking-dead' as const, ...d }))}
            emptyMessage="No zombie deals. Everything is either moving or closed."
          />
        </section>
      )}

      {!loading && counts && counts.mq_reach > 0 && dwellByOutcome.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-text-muted">
            3rd Call Dwell — by Exit Outcome
          </h3>
          <p className="mb-3 text-[11px] text-text-faint">
            How long deals sit in 3rd Call before each outcome. Short dwell before Won = closing fast; long dwell before Lost/LTL = drifting deals — candidates for an alert.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {dwellByOutcome.map(r => {
              const drift = (r.median_days ?? 0) >= 14
              const accent =
                r.outcome === 'won'  ? 'text-emerald-500'
                : r.outcome === 'lost' ? 'text-red-500'
                : r.outcome === 'ltl'  ? 'text-amber-500'
                : r.outcome === 'dq'   ? 'text-red-700'
                : 'text-text-muted'
              return (
                <div key={r.outcome} className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm">
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${accent}`}>
                    {r.outcome_label}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={`font-data text-2xl font-bold ${drift ? 'text-amber-500' : 'text-text-primary'}`}>
                      {r.median_days != null ? r.median_days.toFixed(1) : '—'}
                    </span>
                    <span className="text-xs text-text-muted">days median</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted font-data">
                    <span>mean {r.mean_days != null ? r.mean_days.toFixed(1) + 'd' : '—'}</span>
                    <span>p75 {r.p75_days != null ? r.p75_days.toFixed(1) + 'd' : '—'}</span>
                    <span className="ml-auto">n={r.sample_count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!loading && counts && counts.mq_reach > 0 && (
        <section className="mb-8">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-text-muted">
            Call Score × Outcome — Is the Rubric Predictive?
          </h3>
          <p className="mb-3 text-[11px] text-text-faint">
            For each call slot, win rate (signed / signed+lost) by score band. If higher bands win more often, the rubric is calibrated. Flat rates mean the scoring isn't discriminating.
          </p>
          <CallScoreOutcomeTable rows={callScoreOutcome} />
        </section>
      )}

      <ThirdCallDealsDrawer
        outcome={drillOutcome}
        onClose={() => setDrillOutcome(null)}
        load={loadThirdCallDeals}
      />
    </div>
  )
}
