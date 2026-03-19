import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { useCEOScorecard, type SheetRow } from '../hooks/useCEOScorecard'

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

// ─── Status helpers ─────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const s = status?.toLowerCase?.() ?? ''
  const color = s.includes('green') || s === 'g' ? 'bg-emerald-500'
    : s.includes('red') || s === 'r' ? 'bg-red-500'
    : s.includes('yellow') || s === 'y' ? 'bg-amber-400'
    : 'bg-zinc-300'
  return <div className={`h-2.5 w-2.5 rounded-full ${color} mx-auto`} />
}

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

// ─── Editable Cell ──────────────────────────────────────

const COL_MAP: Record<string, string> = {
  week1: 'B', week2: 'C', week3: 'D', week4: 'E',
  monthlyActual: 'H', monthlyTarget: 'I', status: 'J',
}

function EditableCell({
  value, rowIndex, column, tab, editable, onSaved,
}: {
  value: string | number
  rowIndex: number
  column: string
  tab: string
  editable: boolean
  onSaved: (newVal: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value ?? ''))
  const { toast } = useToast()

  const colLetter = COL_MAP[column]

  if (!editable || !colLetter) {
    return (
      <td className="py-1.5 px-2 text-xs tabular-nums bg-blue-50/30 text-zinc-700 text-right">
        {value || <span className="text-zinc-300">&mdash;</span>}
      </td>
    )
  }

  async function save() {
    setEditing(false)
    if (val === String(value ?? '')) return
    try {
      const res = await apiFetch('/api/scorecard/cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, cell: `${colLetter}${rowIndex}`, value: val }),
      })
      if (res.ok) {
        onSaved(val)
        toast('Cell updated', 'success')
      } else {
        setVal(String(value ?? ''))
        toast('Failed to save cell', 'error')
      }
    } catch {
      setVal(String(value ?? ''))
      toast('Failed to save cell', 'error')
    }
  }

  if (editing) {
    return (
      <td className="py-0.5 px-1">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          className="w-full bg-white border border-yanne rounded px-1 py-0.5 text-xs outline-none tabular-nums"
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => { setEditing(true); setVal(String(value ?? '')) }}
      className="py-1.5 px-2 text-xs tabular-nums text-zinc-700 text-right cursor-pointer hover:bg-amber-50 border-b border-dashed border-transparent hover:border-zinc-300"
    >
      {value || <span className="text-zinc-300">&mdash;</span>}
    </td>
  )
}

// ─── Main Page ──────────────────────────────────────────

export function CEODashboard() {
  const { data, loading, refresh } = useCEOScorecard()
  const [showTargets, setShowTargets] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [localRows, setLocalRows] = useState<SheetRow[]>([])
  const { toast } = useToast()

  useEffect(() => {
    if (data?.sheetRows) setLocalRows(data.sheetRows)
  }, [data?.sheetRows])

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
      <div className="max-w-[1400px] mx-auto space-y-4">
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

  function updateLocalRow(idx: number, column: string, newVal: string) {
    setLocalRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [column]: newVal }
      return next
    })
  }

  return (
    <div className="max-w-[1400px] mx-auto print:max-w-none">
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

      {/* ── SHEET TABLE ────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-200 bg-zinc-50">
                <th className="text-left py-2.5 px-3 w-[280px]">Metric</th>
                <th className="text-right py-2.5 px-2 w-[60px]">W1</th>
                <th className="text-right py-2.5 px-2 w-[60px]">W2</th>
                <th className="text-right py-2.5 px-2 w-[60px]">W3</th>
                <th className="text-right py-2.5 px-2 w-[60px]">W4</th>
                <th className="text-right py-2.5 px-2 w-[100px]">Actual</th>
                <th className="text-right py-2.5 px-2 w-[100px]">Target</th>
                <th className="text-center py-2.5 px-2 w-[60px]">Status</th>
                <th className="text-left py-2.5 px-2 w-[100px]">Owner</th>
              </tr>
            </thead>
            <tbody>
              {localRows.map((row, idx) => {
                if (row.isSection) {
                  return (
                    <tr key={`section-${idx}`}>
                      <td colSpan={9} className="bg-yanne text-white font-bold text-xs uppercase tracking-wider py-2 px-3">
                        {row.metric}
                      </td>
                    </tr>
                  )
                }

                if (row.isSubheader) {
                  return (
                    <tr key={`sub-${idx}`}>
                      <td colSpan={9} className="bg-zinc-100 font-semibold text-xs text-zinc-700 py-1.5 px-3 italic">
                        {row.metric}
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={`row-${idx}`} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                    <td className="py-1.5 px-3 text-xs text-zinc-800 font-medium">{row.metric}</td>
                    <EditableCell value={row.week1} rowIndex={row.rowIndex} column="week1" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week1', v)} />
                    <EditableCell value={row.week2} rowIndex={row.rowIndex} column="week2" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week2', v)} />
                    <EditableCell value={row.week3} rowIndex={row.rowIndex} column="week3" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week3', v)} />
                    <EditableCell value={row.week4} rowIndex={row.rowIndex} column="week4" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week4', v)} />
                    <EditableCell value={row.monthlyActual} rowIndex={row.rowIndex} column="monthlyActual" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'monthlyActual', v)} />
                    <EditableCell value={row.monthlyTarget} rowIndex={row.rowIndex} column="monthlyTarget" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'monthlyTarget', v)} />
                    <td className="py-1.5 px-2 text-center">
                      <StatusDot status={row.status} />
                    </td>
                    <td className="py-1.5 px-2 text-xs text-zinc-500">{row.owner}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BOTTLENECK ─────────────────────────────── */}
      {data.bottleneck && (
        <div className="mb-6 rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 mb-3">
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
            Recommended action: {data.bottleneck.action}
          </div>
        </div>
      )}

      {/* ── ALERTS ─────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">Alerts</h3>
        <div className="space-y-4">
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
