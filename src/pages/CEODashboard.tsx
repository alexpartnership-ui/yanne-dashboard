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

// ─── Status computation ─────────────────────────────────

function parseNum(v: string | number | undefined): number {
  if (v === undefined || v === '') return 0
  const s = String(v).replace(/[$,%K+<>~]/g, '').replace(/\s/g, '').trim()
  if (!s || s === '—') return 0
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function computeStatus(actual: string | number, target: string | number): 'green' | 'yellow' | 'red' | 'gray' {
  const a = parseNum(actual)
  const t = parseNum(target)
  if (t === 0) return 'gray' // no target = no status
  // Handle "Track" or "Track trend" targets
  if (String(target).toLowerCase().includes('track')) return 'gray'
  const ratio = a / t
  if (ratio >= 1) return 'green'
  if (ratio >= 0.75) return 'yellow'
  return 'red'
}

function StatusDot({ status }: { status: 'green' | 'yellow' | 'red' | 'gray' }) {
  const colors = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-400',
    red: 'bg-red-500',
    gray: 'bg-zinc-300',
  }
  return <div className={`h-2.5 w-2.5 rounded-full ${colors[status]} mx-auto`} />
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-emerald-500 text-[10px] font-bold ml-1">{'\u2191'}</span>
  if (trend === 'down') return <span className="text-red-500 text-[10px] font-bold ml-1">{'\u2193'}</span>
  return <span className="text-zinc-300 text-[10px] ml-1">{'\u2192'}</span>
}

// Compute trend from week values
function computeTrend(row: SheetRow): 'up' | 'down' | 'flat' {
  const vals = [row.week1, row.week2, row.week3, row.week4].map(parseNum).filter(v => v > 0)
  if (vals.length < 2) return 'flat'
  const last = vals[vals.length - 1]
  const prev = vals[vals.length - 2]
  const pct = ((last - prev) / Math.abs(prev)) * 100
  if (pct >= 5) return 'up'
  if (pct <= -5) return 'down'
  return 'flat'
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
      <td className="py-1.5 px-2 text-xs tabular-nums text-zinc-600 text-right bg-sky-50/40">
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
      if (res.ok) { onSaved(val); toast('Saved', 'success') }
      else { setVal(String(value ?? '')); toast('Save failed', 'error') }
    } catch { setVal(String(value ?? '')); toast('Save failed', 'error') }
  }

  if (editing) {
    return (
      <td className="py-0.5 px-0.5">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          className="w-full bg-white border-2 border-yanne rounded px-1.5 py-0.5 text-xs outline-none tabular-nums"
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => { setEditing(true); setVal(String(value ?? '')) }}
      className="py-1.5 px-2 text-xs tabular-nums text-zinc-800 text-right cursor-pointer hover:bg-amber-50 transition-colors"
      title="Click to edit"
    >
      {value || <span className="text-zinc-300">&mdash;</span>}
    </td>
  )
}

// ─── Section Header with badge ──────────────────────────

function SectionHeader({ title, rows }: { title: string; rows: SheetRow[] }) {
  // Count metrics in this section that have both actual and target
  const scored = rows.filter(r => !r.isSection && !r.isSubheader)
  const onTarget = scored.filter(r => computeStatus(r.monthlyActual, r.monthlyTarget) === 'green').length
  const total = scored.filter(r => computeStatus(r.monthlyActual, r.monthlyTarget) !== 'gray').length

  return (
    <tr>
      <td colSpan={10} className="bg-yanne text-white font-bold text-[11px] uppercase tracking-wider py-2.5 px-4">
        <div className="flex items-center justify-between">
          <span>{title}</span>
          {total > 0 && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              onTarget === total ? 'bg-emerald-500/30 text-emerald-100' :
              onTarget >= total * 0.5 ? 'bg-amber-500/30 text-amber-100' :
              'bg-red-500/30 text-red-100'
            }`}>
              {onTarget}/{total} on target
            </span>
          )}
        </div>
      </td>
    </tr>
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
        toast(`Synced ${result.cellsWritten} cells`, 'success')
        await refresh()
      } else { toast(result.error || 'Sync failed', 'error') }
    } catch { toast('Sync failed', 'error') }
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

  // Group rows by section for badge counting
  const sections: { title: string; rows: SheetRow[] }[] = []
  let currentSection: { title: string; rows: SheetRow[] } | null = null
  for (const row of localRows) {
    if (row.isSection) {
      currentSection = { title: row.metric, rows: [] }
      sections.push(currentSection)
    } else if (currentSection) {
      currentSection.rows.push(row)
    }
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
          <button onClick={saveSnapshot} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm">Save Snapshot</button>
          <button onClick={() => setShowTargets(true)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm">Edit Targets</button>
          <button
            onClick={async () => {
              const r = await apiFetch('/api/digest/send', { method: 'POST' })
              if (r.ok) toast('Digest sent to Slack', 'success')
              else toast('Failed to send digest', 'error')
            }}
            className="rounded-lg bg-yanne px-3 py-1.5 text-xs font-medium text-white hover:bg-yanne/90 shadow-sm"
          >Send Digest</button>
          <button onClick={syncNow} disabled={syncing} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 shadow-sm disabled:opacity-50">
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
      </div>

      {/* ── FUNNEL FLOW ──────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">Pipeline Flow</div>
        <div className="flex items-center gap-0 overflow-x-auto">
          {data.funnel.map((stage, i) => {
            const pct = stage.target > 0 ? stage.value / stage.target : 0
            const bg = pct >= 1 ? 'bg-emerald-50 border-emerald-200' : pct >= 0.75 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
            const textColor = pct >= 1 ? 'text-emerald-700' : pct >= 0.75 ? 'text-amber-700' : 'text-red-700'

            return (
              <div key={stage.label} className="flex items-center min-w-0">
                <div className={`text-center flex-1 rounded-lg border px-3 py-2.5 ${bg} min-w-[90px]`}>
                  <div className={`text-lg font-bold tabular-nums ${textColor}`}>
                    {stage.label === 'Cash' ? `$${(stage.value / 1000).toFixed(0)}K` : stage.value >= 1000 ? `${(stage.value / 1000).toFixed(0)}K` : stage.value}
                  </div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5 font-medium">{stage.label}</div>
                  <div className="text-[8px] text-zinc-400 tabular-nums">tgt: {stage.target >= 1000 ? `${(stage.target / 1000).toFixed(0)}K` : stage.target}</div>
                </div>
                {i < data.funnel.length - 1 && (
                  <div className="flex flex-col items-center mx-0.5 shrink-0">
                    <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {stage.conversionRate !== null && (
                      <span className={`text-[9px] font-bold tabular-nums ${
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

      {/* ── SHEET TABLE ────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b-2 border-zinc-200 bg-zinc-50">
                <th className="text-left py-2.5 px-4 w-[260px]">Metric</th>
                <th className="text-right py-2.5 px-2 w-[55px]">W1</th>
                <th className="text-right py-2.5 px-2 w-[55px]">W2</th>
                <th className="text-right py-2.5 px-2 w-[55px]">W3</th>
                <th className="text-right py-2.5 px-2 w-[55px]">W4</th>
                <th className="text-right py-2.5 px-2 w-[95px]">Actual</th>
                <th className="text-right py-2.5 px-2 w-[95px]">Target</th>
                <th className="text-center py-2.5 px-2 w-[50px]">Status</th>
                <th className="text-center py-2.5 px-1 w-[30px]">Trend</th>
                <th className="text-left py-2.5 px-2 w-[90px]">Owner</th>
              </tr>
            </thead>
            <tbody>
              {localRows.map((row, idx) => {
                if (row.isSection) {
                  const section = sections.find(s => s.title === row.metric)
                  return <SectionHeader key={`section-${idx}`} title={row.metric} rows={section?.rows || []} />
                }

                if (row.isSubheader) {
                  return (
                    <tr key={`sub-${idx}`}>
                      <td colSpan={10} className="bg-yanne-light/30 font-semibold text-xs text-yanne py-2 px-4 border-b border-yanne-light/40">
                        {row.metric}
                      </td>
                    </tr>
                  )
                }

                const status = computeStatus(row.monthlyActual, row.monthlyTarget)
                const trend = computeTrend(row)
                const rowBg = status === 'red' ? 'bg-red-50/40' : status === 'yellow' ? 'bg-amber-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'

                return (
                  <tr key={`row-${idx}`} className={`border-b border-zinc-100 hover:bg-zinc-100/50 transition-colors ${rowBg}`}>
                    <td className="py-1.5 px-4 text-xs text-zinc-800 font-medium">{row.metric}</td>
                    <EditableCell value={row.week1} rowIndex={row.rowIndex} column="week1" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week1', v)} />
                    <EditableCell value={row.week2} rowIndex={row.rowIndex} column="week2" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week2', v)} />
                    <EditableCell value={row.week3} rowIndex={row.rowIndex} column="week3" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week3', v)} />
                    <EditableCell value={row.week4} rowIndex={row.rowIndex} column="week4" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'week4', v)} />
                    <EditableCell value={row.monthlyActual} rowIndex={row.rowIndex} column="monthlyActual" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'monthlyActual', v)} />
                    <EditableCell value={row.monthlyTarget} rowIndex={row.rowIndex} column="monthlyTarget" tab={data.sheetTab} editable={row.editable} onSaved={v => updateLocalRow(idx, 'monthlyTarget', v)} />
                    <td className="py-1.5 px-2 text-center">
                      <StatusDot status={status} />
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <TrendArrow trend={trend} />
                    </td>
                    <td className="py-1.5 px-2 text-[10px] text-zinc-400">{row.owner}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REP LEADERBOARD ──────────────────────── */}
      {data.repLeaderboard.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-zinc-700">Rep Leaderboard (This Week)</h3>
            <div className="flex gap-4 text-[10px] text-zinc-400">
              <span>Top Theme: <span className="text-zinc-600 font-medium">{data.topCoachingTheme}</span></span>
              <span>Weakest: <span className="text-zinc-600 font-medium">{data.worstCategory}</span></span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
                <th className="text-left pb-2 w-8">#</th>
                <th className="text-left pb-2">Rep</th>
                <th className="text-right pb-2">Calls</th>
                <th className="text-right pb-2">Avg Score</th>
                <th className="text-right pb-2">Deals Adv.</th>
              </tr>
            </thead>
            <tbody>
              {data.repLeaderboard.map((r, i) => {
                const medal = i === 0 ? '\uD83E\uDD47' : i === 1 ? '\uD83E\uDD48' : i === 2 ? '\uD83E\uDD49' : `#${i + 1}`
                const bg = r.avgScore >= 70 ? 'bg-emerald-50/60' : r.avgScore >= 55 ? 'bg-amber-50/60' : 'bg-red-50/60'
                return (
                  <tr key={r.name} className={`border-b border-zinc-100 ${bg}`}>
                    <td className="py-2 text-sm">{medal}</td>
                    <td className="py-2 text-xs font-semibold text-zinc-800">{r.name}</td>
                    <td className="py-2 text-xs text-zinc-600 text-right tabular-nums">{r.calls}</td>
                    <td className={`py-2 text-xs font-bold text-right tabular-nums ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 55 ? 'text-amber-600' : 'text-red-600'}`}>{r.avgScore}%</td>
                    <td className="py-2 text-xs text-zinc-600 text-right tabular-nums">{r.dealsAdvanced}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SETTER BREAKDOWN ──────────────────────── */}
      {data.setterBreakdown.length > 0 && (
        <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-bold text-zinc-700 mb-3">Setter Breakdown</h3>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
                <th className="text-left pb-2">Setter</th>
                <th className="text-right pb-2">Assigned</th>
                <th className="text-right pb-2">Unactioned</th>
                <th className="text-right pb-2">Meetings</th>
                <th className="text-right pb-2">Conv %</th>
              </tr>
            </thead>
            <tbody>
              {data.setterBreakdown.map(s => (
                <tr key={s.name} className="border-b border-zinc-100">
                  <td className="py-2 text-xs font-medium text-zinc-800">{s.name}</td>
                  <td className="py-2 text-xs text-zinc-600 text-right tabular-nums">{s.assigned}</td>
                  <td className={`py-2 text-xs font-semibold text-right tabular-nums ${s.unactioned > 10 ? 'text-red-600' : 'text-zinc-600'}`}>{s.unactioned}</td>
                  <td className="py-2 text-xs text-zinc-600 text-right tabular-nums">{s.meetings}</td>
                  <td className="py-2 text-xs text-zinc-600 text-right tabular-nums">{s.conversionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BOTTLENECK ─────────────────────────────── */}
      {data.bottleneck && (
        <div className="mb-6 rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-bold text-amber-900 mb-2">This Week's Bottleneck</h3>
          <div className="text-sm text-amber-800 mb-2">
            <span className="font-bold">{data.bottleneck.stage}:</span> {data.bottleneck.actual}% conversion (target: {data.bottleneck.target}%)
          </div>
          <div className="text-xs text-amber-700 space-y-0.5">
            <div>Owner: {data.bottleneck.owner} | Impact: {data.bottleneck.impact}</div>
            <div>Root cause: {data.bottleneck.rootCause}</div>
          </div>
          <div className="mt-2 text-xs font-semibold text-amber-900">Action: {data.bottleneck.action}</div>
        </div>
      )}

      {/* ── ALERTS ─────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">Alerts</h3>
        <div className="space-y-3">
          {data.alerts.filter(a => a.level === 'critical').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">Critical</div>
              {data.alerts.filter(a => a.level === 'critical').map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-1.5 mb-1">
                  <div className="h-2 w-2 rounded-full bg-red-500 mt-1 shrink-0" />
                  <span className="text-xs text-red-800">{a.message}</span>
                </div>
              ))}
            </div>
          )}
          {data.alerts.filter(a => a.level === 'warning').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 mb-1">Warning</div>
              {data.alerts.filter(a => a.level === 'warning').map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-1.5 mb-1">
                  <div className="h-2 w-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                  <span className="text-xs text-amber-800">{a.message}</span>
                </div>
              ))}
            </div>
          )}
          {data.alerts.filter(a => a.level === 'win').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-1">Wins</div>
              {data.alerts.filter(a => a.level === 'win').map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 mb-1">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  <span className="text-xs text-emerald-800">{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── WEEKLY COMPARISON ──────────────────────── */}
      <div className="rounded-xl border border-[#E5E5E5] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold text-zinc-700 mb-3">This Week vs Last Week</h3>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-200">
              <th className="text-left pb-2">Metric</th>
              <th className="text-right pb-2">This Week</th>
              <th className="text-right pb-2">Last Week</th>
              <th className="text-right pb-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.weeklyComparison.map(row => (
              <tr key={row.metric} className="border-b border-zinc-100">
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
  )
}
