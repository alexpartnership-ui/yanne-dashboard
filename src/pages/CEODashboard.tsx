import { useState, useEffect } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useCEOScorecard, type CEOScorecardData } from '../hooks/useCEOScorecard'
import { Spinner } from '../components/Spinner'

// ─── Targets Editor ─────────────────────────────────────

interface Targets { [key: string]: number }

function TargetsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    window.location.reload()
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

// ─── Department Card ────────────────────────────────────

interface DeptCardProps {
  icon: string
  title: string
  owner: string
  accent: string
  metrics: CEOScorecardData['outbound']
  children?: React.ReactNode
  defaultOpen?: boolean
}

function DeptCard({ icon, title, owner, accent, metrics, children, defaultOpen = true }: DeptCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const greens = metrics.filter(m => m.status === 'green').length
  const total = metrics.length

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors"
        style={{ borderLeft: `4px solid ${accent}` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
            <span className="text-[10px] text-zinc-400">Owner: {owner}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">{greens}/{total} on target</span>
          <svg className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4">
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
                <tr key={m.name}>
                  <td className="py-2 pr-2 text-xs text-zinc-700">{m.name}</td>
                  <td className="py-2 pr-2 text-xs text-zinc-400">{m.owner}</td>
                  <td className="py-2 pr-2 text-xs text-zinc-500 text-right">{m.target}</td>
                  <td className="py-2 pr-2 text-xs font-semibold text-zinc-900 text-right">{m.actual}</td>
                  <td className="py-2 pr-2 text-center"><StatusDot status={m.status} /></td>
                  <td className="py-2 text-center"><TrendArrow trend={m.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
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

  if (loading && !data) return <Spinner />
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
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-400">Last refreshed: {data.lastRefreshed}</span>
          <button
            onClick={() => setShowTargets(true)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm"
          >
            Edit Targets
          </button>
          <button
            onClick={refresh}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm"
          >
            Sync Now
          </button>
        </div>
        <TargetsModal open={showTargets} onClose={() => setShowTargets(false)} />
      </div>

      {/* ── NORTH STAR ─────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm text-center">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Revenue Target</div>
        <div className="text-4xl font-bold text-zinc-900">
          ${(data.revenueCollected / 1000).toFixed(0)}K
          <span className="text-lg font-normal text-zinc-400 ml-2">/ $833K monthly target</span>
        </div>
        <div className="mt-3 mx-auto max-w-xl">
          <div className="h-4 rounded-full bg-zinc-100 overflow-hidden">
            <div className={`h-full rounded-full ${revBarColor} transition-all`} style={{ width: `${Math.min(revPct, 100)}%` }} />
          </div>
          <div className="text-xs text-zinc-500 mt-1">{revPct}% of target ($10M annual run rate)</div>
        </div>
        <div className="mt-4 flex justify-center gap-8 text-xs text-zinc-500">
          <div>Cash Collected MTD: <span className="font-semibold text-zinc-800">${(data.revenueCollected / 1000).toFixed(0)}K</span></div>
          <div>Retainers: <span className="font-semibold text-zinc-800">${(data.retainers / 1000).toFixed(0)}K</span></div>
          <div>Success Fees: <span className="font-semibold text-zinc-800">${(data.successFees / 1000).toFixed(0)}K</span></div>
        </div>
      </div>

      {/* ── PIPELINE FUNNEL ────────────────────────── */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {data.funnel.map((stage, i) => (
            <div key={stage.label} className="flex items-center flex-1 min-w-0">
              <div className="text-center flex-1">
                <div className="text-lg font-bold text-zinc-900">
                  {stage.label === 'Cash' ? `$${(stage.value / 1000).toFixed(0)}K` : stage.value >= 1000 ? `${(stage.value / 1000).toFixed(0)}K` : stage.value}
                </div>
                <div className="text-[9px] text-zinc-400 uppercase tracking-wider mt-0.5">{stage.label}</div>
                {stage.conversionRate !== null && (
                  <div className={`text-[10px] font-semibold mt-0.5 ${
                    stage.conversionTarget !== null && stage.conversionRate >= stage.conversionTarget ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {stage.conversionRate}% {'\u2192'}
                  </div>
                )}
              </div>
              {i < data.funnel.length - 1 && (
                <svg className="w-4 h-4 text-zinc-300 shrink-0 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── DEPARTMENT CARDS ───────────────────────── */}
      <div className="space-y-4 mb-6">
        {/* Outbound */}
        <DeptCard icon={'\uD83D\uDCE7'} title="OUTBOUND" owner="Outreachify" accent="#3B82F6" metrics={data.outbound} />

        {/* Setters */}
        <DeptCard icon={'\uD83D\uDC64'} title="SETTERS" owner="Alex" accent="#8B5CF6" metrics={data.setters}>
          {data.setterBreakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Setter Breakdown</div>
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
                      <td className="py-1.5 text-xs text-zinc-600 text-right">{s.assigned}</td>
                      <td className={`py-1.5 text-xs font-semibold text-right ${s.unactioned > 10 ? 'text-red-600' : 'text-zinc-600'}`}>{s.unactioned}</td>
                      <td className="py-1.5 text-xs text-zinc-600 text-right">{s.meetings}</td>
                      <td className="py-1.5 text-xs text-zinc-600 text-right">{s.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DeptCard>

        {/* Sales / Closers */}
        <DeptCard icon={'\uD83D\uDCDE'} title="SALES / CLOSERS" owner={'\u26A0\uFE0F VACANT'} accent="#EF4444" metrics={data.sales}>
          {/* Rep leaderboard */}
          {data.repLeaderboard.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Rep Leaderboard (This Week)</div>
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                    <th className="text-left pb-1">#</th>
                    <th className="text-left pb-1">Rep</th>
                    <th className="text-right pb-1">Calls</th>
                    <th className="text-right pb-1">Avg Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {data.repLeaderboard.map((r, i) => (
                    <tr key={r.name}>
                      <td className="py-1.5 text-xs text-zinc-400">#{i + 1}</td>
                      <td className="py-1.5 text-xs font-medium text-zinc-800">{r.name}</td>
                      <td className="py-1.5 text-xs text-zinc-600 text-right">{r.calls}</td>
                      <td className={`py-1.5 text-xs font-semibold text-right ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 55 ? 'text-amber-600' : 'text-red-600'}`}>{r.avgScore}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex gap-4 text-xs">
                <div><span className="text-zinc-400">Top Coaching Theme:</span> <span className="text-zinc-700">{data.topCoachingTheme}</span></div>
                <div><span className="text-zinc-400">Worst Category:</span> <span className="text-zinc-700">{data.worstCategory}</span></div>
              </div>
            </div>
          )}
        </DeptCard>

        {/* Fulfillment */}
        <DeptCard icon={'\uD83E\uDD1D'} title="FULFILLMENT" owner="Philip / Mukul" accent="#22C55E" metrics={data.fulfillment}>
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
        <DeptCard icon={'\uD83D\uDCB0'} title="FINANCE" owner="Alex" accent="#F59E0B" metrics={data.finance} />
      </div>

      {/* ── BOTTLENECK ─────────────────────────────── */}
      {data.bottleneck && (
        <div className="mb-6 rounded-lg border-2 border-amber-200 bg-amber-50 p-5">
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
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">Alerts</h3>
        <div className="space-y-4">
          {/* Critical */}
          {data.alerts.filter(a => a.level === 'critical').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1.5">Critical</div>
              <div className="space-y-1">
                {data.alerts.filter(a => a.level === 'critical').map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded bg-red-50 px-3 py-2">
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
                  <div key={i} className="flex items-start gap-2 rounded bg-amber-50 px-3 py-2">
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
                  <div key={i} className="flex items-start gap-2 rounded bg-emerald-50 px-3 py-2">
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
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">This Week vs Last Week</h3>
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
                <td className="py-2 text-xs font-semibold text-zinc-900 text-right">{row.thisWeek}</td>
                <td className="py-2 text-xs text-zinc-500 text-right">{row.lastWeek}</td>
                <td className={`py-2 text-xs font-semibold text-right ${
                  String(row.change).startsWith('+') ? 'text-emerald-600' :
                  String(row.change).startsWith('-') ? 'text-red-600' : 'text-zinc-400'
                }`}>{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
