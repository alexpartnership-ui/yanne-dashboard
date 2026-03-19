import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { useCEOScorecard, type CEOScorecardData } from '../hooks/useCEOScorecard'

// ─── Targets Editor ─────────────────────────────────────

interface Targets { [key: string]: number }

function TargetsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const [targets, setTargets] = useState<Targets>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) apiFetch('/api/scorecard/targets').then(r => r.json()).then(setTargets)
  }, [open])

  async function save() {
    setSaving(true)
    await apiFetch('/api/scorecard/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targets),
    })
    setSaving(false)
    onClose()
    onSaved?.()
  }

  if (!open) return null

  const fields: { key: string; label: string; prefix?: string; suffix?: string }[] = [
    { key: 'revenueTarget', label: 'Monthly Revenue Target', prefix: '$' },
    { key: 'emailsSentWeek', label: 'Emails Sent / Week' },
    { key: 'activeCampaigns', label: 'Active Campaigns' },
    { key: 'replyRate', label: 'Reply Rate Target', suffix: '%' },
    { key: 'bounceRate', label: 'Max Bounce Rate', suffix: '%' },
    { key: 'interestedWeek', label: 'Interested Replies / Week' },
    { key: 'connectedSenders', label: 'Connected Senders' },
    { key: 'burntSenders', label: 'Max Burnt Senders' },
    { key: 'unactionedReplies', label: 'Max Unactioned Replies' },
    { key: 'interestedToMeeting', label: 'Interested to Meeting %', suffix: '%' },
    { key: 'meetingsBookedWeek', label: 'Meetings Booked / Week' },
    { key: 'callsScoredWeek', label: 'Calls Scored / Week' },
    { key: 'teamAvgScore', label: 'Team Avg Score', suffix: '%' },
    { key: 'c1toC2Rate', label: 'Call 1 to Call 2 Rate', suffix: '%' },
    { key: 'c2toC3Rate', label: 'Call 2 to Call 3 Rate', suffix: '%' },
    { key: 'qualificationRate', label: 'Qualification Rate', suffix: '%' },
    { key: 'proposalsSent', label: 'Proposals Sent / Week' },
    { key: 'closeRate', label: 'Close Rate', suffix: '%' },
    { key: 'stalledDeals', label: 'Max Stalled Deals' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-zinc-900">Edit Scorecard Targets</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{f.label}</label>
              <div className="flex items-center gap-1 mt-0.5">
                {f.prefix && <span className="text-xs text-zinc-400">{f.prefix}</span>}
                <input
                  type="number"
                  value={targets[f.key] ?? ''}
                  onChange={e => setTargets(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm text-zinc-800 focus:border-yanne focus:outline-none"
                />
                {f.suffix && <span className="text-xs text-zinc-400">{f.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-yanne px-4 py-2 text-xs font-medium text-white hover:bg-yanne/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Targets'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status dot ─────────────────────────────────────────

function StatusDot({ status }: { status: 'green' | 'red' | 'yellow' }) {
  const colors = { green: 'bg-emerald-500', red: 'bg-red-500', yellow: 'bg-amber-400' }
  return <div className={`h-2.5 w-2.5 rounded-full ${colors[status]}`} />
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-emerald-500 text-xs font-bold">{'\u2191'}</span>
  if (trend === 'down') return <span className="text-red-500 text-xs font-bold">{'\u2193'}</span>
  return <span className="text-zinc-400 text-xs">{'\u2192'}</span>
}

// ─── Stale Data Badge ───────────────────────────────────

function StaleBadge({ freshness, sourceKey }: { freshness: Record<string, string>; sourceKey: string }) {
  if (!freshness || freshness[sourceKey] === 'live') return null
  return <span className="text-[9px] text-amber-500 ml-2 font-medium">&#9888; stale data</span>
}

// ─── Skeleton Loader ────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <div className="skeleton h-4 w-48 mb-3" />
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="skeleton h-3 w-full" />)}
      </div>
    </div>
  )
}

// ─── Department Card ────────────────────────────────────

interface DeptCardProps {
  icon: string
  title: string
  owner: string
  accent: string
  metrics: CEOScorecardData['outbound']
  children?: React.ReactNode
  defaultOpen?: boolean
  freshness?: Record<string, string>
  sourceKey?: string
}

function DeptCard({ icon, title, owner, accent, metrics, children, defaultOpen = true, freshness, sourceKey }: DeptCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const greens = metrics.filter(m => m.status === 'green').length
  const yellows = metrics.filter(m => m.status === 'yellow').length
  const total = metrics.length

  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors"
        style={{ borderLeft: `4px solid ${accent}` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <h3 className="text-sm font-bold text-zinc-900">
              {title}
              {freshness && sourceKey && <StaleBadge freshness={freshness} sourceKey={sourceKey} />}
            </h3>
            <span className="text-[10px] text-zinc-400">Owner: {owner}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            {greens}/{total} on target
            {yellows > 0 && <span className="text-amber-500 ml-1">({yellows} close)</span>}
          </span>
          <svg className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-100">
                  <th className="text-left pb-2 pr-2">Metric</th>
                  <th className="text-left pb-2 pr-2">Owner</th>
                  <th className="text-right pb-2 pr-2">Target</th>
                  <th className="text-right pb-2 pr-2">Actual</th>
                  <th className="text-center pb-2 pr-2">Status</th>
                  <th className="text-center pb-2">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {metrics.map(m => (
                  <tr key={m.name} className={m.status === 'red' ? 'bg-red-50/30' : m.status === 'yellow' ? 'bg-amber-50/30' : ''}>
                    <td className="py-2 pr-2 text-xs text-zinc-700">{m.name}</td>
                    <td className="py-2 pr-2 text-xs text-zinc-400">{m.owner}</td>
                    <td className="py-2 pr-2 text-xs text-zinc-500 text-right tabular-nums">{m.target}</td>
                    <td className="py-2 pr-2 text-xs font-semibold text-zinc-900 text-right tabular-nums">{m.actual}</td>
                    <td className="py-2 pr-2 text-center"><StatusDot status={m.status} /></td>
                    <td className="py-2 text-center"><TrendArrow trend={m.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export function CEODashboard() {
  const { data, loading, refresh } = useCEOScorecard()
  const [showTargets, setShowTargets] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const { toast } = useToast()

  const saveSnapshot = useCallback(async () => {
    if (!data) return
    try {
      const snapshot = {
        weekRange: data.weekRange,
        revenueCollected: data.revenueCollected,
        revenueTarget: data.revenueTarget,
        funnel: data.funnel.map(f => ({ label: f.label, value: f.value, target: f.target })),
        outbound: data.outbound.map(m => ({ name: m.name, rawActual: m.rawActual, rawTarget: m.rawTarget, status: m.status })),
        sales: data.sales.map(m => ({ name: m.name, rawActual: m.rawActual, rawTarget: m.rawTarget, status: m.status })),
        linkedin: data.linkedin.map(m => ({ name: m.name, rawActual: m.rawActual, rawTarget: m.rawTarget, status: m.status })),
      }
      const res = await apiFetch('/api/scorecard/snapshot', { method: 'POST', body: JSON.stringify(snapshot) })
      if (res.ok) toast('Snapshot saved', 'success')
      else toast('Failed to save snapshot', 'error')
    } catch { toast('Failed to save snapshot', 'error') }
  }, [data, toast])

  const syncNow = useCallback(async () => {
    setSyncing(true)
    try {
      const r = await apiFetch('/api/scorecard/sync', { method: 'POST' })
      const result = await r.json()
      if (r.ok) {
        toast(`Synced ${result.cellsWritten} cells to Google Sheet`, 'success')
        await refresh()
      } else {
        toast(result.error || 'Sync failed', 'error')
      }
    } catch {
      toast('Sync failed', 'error')
    }
    setSyncing(false)
  }, [refresh, toast])

  if (loading && !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="skeleton h-8 w-64 mb-6" />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }
  if (!data) return <p className="text-sm text-zinc-400">Failed to load scorecard</p>

  const revPct = data.revenueTarget > 0 ? Math.round((data.revenueCollected / data.revenueTarget) * 100) : 0
  const revBarColor = revPct >= 70 ? 'bg-emerald-500' : revPct >= 40 ? 'bg-amber-400' : 'bg-red-500'

  return (
    <div className="max-w-[1200px] mx-auto print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Growth Scorecard</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Week of {data.weekRange}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-[10px] text-zinc-400">Last refreshed: {data.lastRefreshed}</span>
          <button
            onClick={saveSnapshot}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm"
          >
            Save Snapshot
          </button>
          <button
            onClick={() => setShowTargets(true)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm"
          >
            Edit Targets
          </button>
          <button
            onClick={async () => {
              const r = await apiFetch('/api/digest/send', { method: 'POST' })
              if (r.ok) toast('Digest sent to Slack', 'success')
              else toast('Failed to send digest', 'error')
            }}
            className="rounded-lg bg-[#1A3C34] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1A3C34]/90 shadow-sm"
          >
            Send Digest
          </button>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        <TargetsModal open={showTargets} onClose={() => setShowTargets(false)} onSaved={refresh} />
      </div>

      {/* ── NORTH STAR ─────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Revenue Target</div>
        <div className="text-4xl font-bold text-zinc-900 tabular-nums">
          ${(data.revenueCollected / 1000).toFixed(0)}K
          <span className="text-lg font-normal text-zinc-400 ml-2">/ ${((data.revenueTarget || 833000) / 1000).toFixed(0)}K monthly target</span>
        </div>
        <div className="mt-3 mx-auto max-w-xl">
          <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
            <div className={`h-full rounded-full ${revBarColor} transition-all`} style={{ width: `${Math.min(revPct, 100)}%` }} />
          </div>
          <div className="text-xs text-zinc-500 mt-1 tabular-nums">{revPct}% of target ($10M annual run rate)</div>
        </div>
        <div className="mt-4 flex justify-center gap-8 text-xs text-zinc-500">
          <div>Cash Collected MTD: <span className="font-semibold text-zinc-800 tabular-nums">${(data.revenueCollected / 1000).toFixed(0)}K</span></div>
          <div>Retainers: <span className="font-semibold text-zinc-800 tabular-nums">${(data.retainers / 1000).toFixed(0)}K</span></div>
          <div>Success Fees: <span className="font-semibold text-zinc-800 tabular-nums">${(data.successFees / 1000).toFixed(0)}K</span></div>
        </div>
      </div>

      {/* ── PIPELINE FUNNEL ────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-1 overflow-x-auto">
          {data.funnel.map((stage, i) => {
            const atTarget = stage.conversionTarget !== null && stage.conversionRate !== null
              ? stage.conversionRate >= stage.conversionTarget
              : stage.value >= stage.target
            const nearTarget = !atTarget && (stage.value / Math.max(stage.target, 1)) >= 0.75
            const bgTint = atTarget ? 'bg-emerald-50' : nearTarget ? 'bg-amber-50' : 'bg-red-50/50'

            return (
              <div key={stage.label} className="flex items-center flex-1 min-w-0">
                <div className={`text-center flex-1 rounded-lg px-2 py-2 ${bgTint}`}>
                  <div className="text-lg font-bold text-zinc-900 tabular-nums">
                    {stage.label === 'Cash' ? `$${(stage.value / 1000).toFixed(0)}K` : stage.value >= 1000 ? `${(stage.value / 1000).toFixed(0)}K` : stage.value}
                  </div>
                  <div className="text-[9px] text-zinc-400 uppercase tracking-wider mt-0.5">{stage.label}</div>
                </div>
                {i < data.funnel.length - 1 && (
                  <div className="flex flex-col items-center mx-1 shrink-0">
                    <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {stage.conversionRate !== null && (
                      <span className={`text-[9px] font-semibold ${
                        stage.conversionTarget !== null && stage.conversionRate >= stage.conversionTarget ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {stage.conversionRate}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── DEPARTMENT CARDS ───────────────────────── */}
      <div className="space-y-4 mb-6">
        {/* Email Outbound */}
        <DeptCard icon={'\uD83D\uDCE7'} title="OUTBOUND — EMAIL" owner="Outreachify" accent="#3B82F6" metrics={data.outbound} freshness={data.dataFreshness} sourceKey="bison" />

        {/* LinkedIn Outbound */}
        <DeptCard icon={'\uD83D\uDD17'} title="OUTBOUND — LINKEDIN" owner="Outreachify" accent="#0A66C2" metrics={data.linkedin} freshness={data.dataFreshness} sourceKey="linkedin" />

        {/* Setters */}
        <DeptCard icon={'\uD83D\uDC64'} title="SETTERS" owner="Alex" accent="#8B5CF6" metrics={data.setters}>
          {data.setterBreakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Setter Breakdown</div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                      <th className="text-left pb-1">Setter</th>
                      <th className="text-right pb-1">Assigned</th>
                      <th className="text-right pb-1">Unactioned</th>
                      <th className="text-right pb-1">Meetings</th>
                      <th className="text-right pb-1">Conv %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.setterBreakdown.map(s => (
                      <tr key={s.name}>
                        <td className="py-1.5 text-xs text-zinc-700">{s.name}</td>
                        <td className="py-1.5 text-xs text-zinc-600 text-right tabular-nums">{s.assigned}</td>
                        <td className={`py-1.5 text-xs font-semibold text-right tabular-nums ${s.unactioned > 10 ? 'text-red-600' : 'text-zinc-600'}`}>{s.unactioned}</td>
                        <td className="py-1.5 text-xs text-zinc-600 text-right tabular-nums">{s.meetings}</td>
                        <td className="py-1.5 text-xs text-zinc-600 text-right tabular-nums">{s.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DeptCard>

        {/* Sales / Closers */}
        <DeptCard icon={'\uD83D\uDCDE'} title="SALES / CLOSERS" owner={'\u26A0\uFE0F VACANT'} accent="#EF4444" metrics={data.sales}>
          {data.repLeaderboard.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Rep Leaderboard (This Week)</div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                      <th className="text-left pb-1">#</th>
                      <th className="text-left pb-1">Rep</th>
                      <th className="text-right pb-1">Calls</th>
                      <th className="text-right pb-1">Avg Score</th>
                      <th className="text-right pb-1">Deals Adv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.repLeaderboard.map((r, i) => {
                      const medal = i === 0 ? '\uD83E\uDD47' : i === 1 ? '\uD83E\uDD48' : i === 2 ? '\uD83E\uDD49' : `#${i + 1}`
                      const rowBg = r.avgScore >= 70 ? 'bg-emerald-50/40' : r.avgScore >= 55 ? 'bg-amber-50/40' : 'bg-red-50/40'
                      return (
                        <tr key={r.name} className={rowBg}>
                          <td className="py-1.5 text-xs text-zinc-400">{medal}</td>
                          <td className="py-1.5 text-xs font-medium text-zinc-800">{r.name}</td>
                          <td className="py-1.5 text-xs text-zinc-600 text-right tabular-nums">{r.calls}</td>
                          <td className={`py-1.5 text-xs font-semibold text-right tabular-nums ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 55 ? 'text-amber-600' : 'text-red-600'}`}>{r.avgScore}%</td>
                          <td className="py-1.5 text-xs text-zinc-600 text-right tabular-nums">{r.dealsAdvanced}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex gap-4 text-xs">
                <div><span className="text-zinc-400">Top Coaching Theme:</span> <span className="text-zinc-700">{data.topCoachingTheme}</span></div>
                <div><span className="text-zinc-400">Worst Category:</span> <span className="text-zinc-700">{data.worstCategory}</span></div>
              </div>
            </div>
          )}
        </DeptCard>

        {/* Fulfillment */}
        <DeptCard icon={'\uD83E\uDD1D'} title="FULFILLMENT" owner="Philip / Mukul" accent="#22C55E" metrics={data.fulfillment} freshness={data.dataFreshness} sourceKey="googleSheet">
          {data.clientStatus.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Client Status</div>
              <div className="space-y-1">
                {data.clientStatus.map(c => (
                  <div key={c.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-medium text-zinc-800">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DeptCard>

        {/* Finance */}
        <DeptCard icon={'\uD83D\uDCB0'} title="FINANCE" owner="Alex" accent="#F59E0B" metrics={data.finance} freshness={data.dataFreshness} sourceKey="hubspot" />
      </div>

      {/* ── BOTTLENECK ─────────────────────────────── */}
      {data.bottleneck && (
        <div className="mb-6 rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{'\uD83C\uDFAF'}</span>
            <h3 className="text-sm font-bold text-amber-900">This Week's Bottleneck (Theory of Constraints)</h3>
          </div>
          <div className="text-sm text-amber-800 mb-2">
            <span className="font-bold">{data.bottleneck.stage}:</span> {data.bottleneck.actual}% conversion (target: {data.bottleneck.target}%)
          </div>
          <div className="text-xs text-amber-700 space-y-1">
            <div>Owner: {data.bottleneck.owner}</div>
            <div>Impact: {data.bottleneck.impact}</div>
            <div>Root cause: {data.bottleneck.rootCause}</div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-900">
            <span>{'\u26A1'}</span> Recommended action: {data.bottleneck.action}
          </div>
        </div>
      )}

      {/* ── ALERTS ─────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">Alerts</h3>
        <div className="space-y-4">
          {/* Critical */}
          {data.alerts.filter(a => a.level === 'critical').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1.5">Critical</div>
              <div className="space-y-1">
                {data.alerts.filter(a => a.level === 'critical').map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-red-500 mt-1 shrink-0" />
                    <span className="text-xs text-red-800">{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          {data.alerts.filter(a => a.level === 'warning').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 mb-1.5">Warning</div>
              <div className="space-y-1">
                {data.alerts.filter(a => a.level === 'warning').map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                    <span className="text-xs text-amber-800">{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wins */}
          {data.alerts.filter(a => a.level === 'win').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-1.5">Wins</div>
              <div className="space-y-1">
                {data.alerts.filter(a => a.level === 'win').map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                    <span className="text-xs text-emerald-800">{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── WEEKLY COMPARISON ──────────────────────── */}
      <div className="rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">This Week vs Last Week</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-100">
                <th className="text-left pb-2">Metric</th>
                <th className="text-right pb-2">This Week</th>
                <th className="text-right pb-2">Last Week</th>
                <th className="text-right pb-2">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {data.weeklyComparison.map(row => (
                <tr key={row.metric}>
                  <td className="py-2 text-xs text-zinc-700">{row.metric}</td>
                  <td className="py-2 text-xs font-semibold text-zinc-900 text-right tabular-nums">{row.thisWeek}</td>
                  <td className="py-2 text-xs text-zinc-500 text-right tabular-nums">{row.lastWeek}</td>
                  <td className={`py-2 text-xs font-semibold text-right tabular-nums ${
                    String(row.change).startsWith('+') ? 'text-emerald-600' :
                    String(row.change).startsWith('-') ? 'text-red-600' : 'text-zinc-400'
                  }`}>{row.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
