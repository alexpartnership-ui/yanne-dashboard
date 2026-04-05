import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { useCEOScorecard, type SheetRow } from '../hooks/useCEOScorecard'

// ─── Notify Slack Button ────────────────────────────────

function NotifySlackButton() {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { toast } = useToast()

  async function notify() {
    setSending(true)
    try {
      const res = await apiFetch('/api/monday/overdue/notify', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSent(true)
        toast(`Posted ${data.count} overdue tasks to Slack`, 'success')
      } else {
        toast(data.error || 'Failed to notify', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setSending(false)
  }

  if (sent) return <span className="text-[10px] text-emerald-600 font-medium">Sent to Slack</span>

  return (
    <button
      onClick={notify}
      disabled={sending}
      className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {sending ? 'Sending...' : 'Notify Slack'}
    </button>
  )
}

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
    { key: 'emailsSentMonth', label: 'Emails Sent / Month' },
    { key: 'repliesMonth', label: 'Replies / Month' },
    { key: 'interestedMonth', label: 'Interested / Month' },
    { key: 'meetingsMonth', label: 'Meetings / Month' },
    { key: 'proposalsMonth', label: 'Proposals / Month' },
    { key: 'signedMonth', label: 'Signed / Month' },
{ key: 'replyRate', label: 'Reply Rate Target', suffix: '%' },
    { key: 'bounceRate', label: 'Max Bounce Rate', suffix: '%' },
{ key: 'teamAvgScore', label: 'Team Avg Score', suffix: '%' },
    { key: 'qualificationRate', label: 'Qualification Rate', suffix: '%' },
    { key: 'closeRate', label: 'Close Rate', suffix: '%' },
    { key: 'stalledDeals', label: 'Max Stalled Deals' },
    { key: 'interestedToMeetingRate', label: 'Interested → Meeting %', suffix: '%' },
    { key: 'meetingsBookedWeek', label: 'Meetings Booked / Week' },
    { key: 'c1to2Rate', label: 'Call 1 → Call 2 Rate', suffix: '%' },
    { key: 'c2to3Rate', label: 'Call 2 → Call 3 Rate', suffix: '%' },
    { key: 'proposalsSent', label: 'Proposals Sent / Month' },
    { key: 'linkedinMessagesSent', label: 'LinkedIn Messages Sent / Mo' },
    { key: 'linkedinMessageReplyRate', label: 'LinkedIn Reply Rate', suffix: '%' },
    { key: 'linkedinConnectionsSent', label: 'LinkedIn Connections / Mo' },
    { key: 'linkedinConnectionAcceptRate', label: 'LinkedIn Accept Rate', suffix: '%' },
    { key: 'linkedinMeetingsBooked', label: 'LinkedIn Meetings / Mo' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">Edit Scorecard Targets</h3>
          <button onClick={onClose} className="text-text-faint hover:text-text-secondary text-xl leading-none">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{f.label}</label>
              <div className="flex items-center gap-1 mt-0.5">
                {f.prefix && <span className="text-xs text-text-muted">{f.prefix}</span>}
                <input
                  type="number"
                  value={targets[f.key] ?? ''}
                  onChange={e => setTargets(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text-primary bg-surface-sunken focus:border-yanne-500 focus:outline-none"
                />
                {f.suffix && <span className="text-xs text-text-muted">{f.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs text-text-muted hover:bg-surface-sunken">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-yanne-500 px-4 py-2 text-xs font-medium text-white hover:bg-yanne-400 disabled:opacity-50">
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
  if (t === 0) return 'gray'
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
    gray: 'bg-border-strong',
  }
  return <div className={`h-2.5 w-2.5 rounded-full ${colors[status]} mx-auto`} />
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <span className="text-emerald-600 text-[10px] font-bold ml-1">{'\u2191'}</span>
  if (trend === 'down') return <span className="text-red-500 text-[10px] font-bold ml-1">{'\u2193'}</span>
  return <span className="text-text-muted text-[10px] ml-1">{'\u2192'}</span>
}

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
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
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
  monthlyActual: 'H', monthlyTarget: 'I', status: 'J', owner: 'K',
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
  const isTextCol = column === 'owner'
  const align = isTextCol ? 'text-left' : 'text-right'

  if (!editable || !colLetter) {
    return (
      <td className={`py-1.5 px-2 text-xs ${isTextCol ? '' : 'tabular-nums'} text-text-muted ${align} bg-yanne-50/40`}>
        {value || <span className="text-text-faint">&mdash;</span>}
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
          className={`w-full bg-white border-2 border-yanne-500 rounded px-1.5 py-0.5 text-xs outline-none ${isTextCol ? '' : 'tabular-nums'}`}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => { setEditing(true); setVal(String(value ?? '')) }}
      className={`py-1.5 px-2 text-xs ${isTextCol ? '' : 'tabular-nums'} text-text-primary ${align} cursor-pointer hover:bg-amber-50 transition-colors`}
      title="Click to edit"
    >
      {value || <span className="text-text-faint">&mdash;</span>}
    </td>
  )
}

// ─── Section Header with badge ──────────────────────────

function SectionHeader({ title, rows }: { title: string; rows: SheetRow[] }) {
  const scored = rows.filter(r => !r.isSection && !r.isSubheader)
  const onTarget = scored.filter(r => computeStatus(r.monthlyActual, r.monthlyTarget) === 'green').length
  const total = scored.filter(r => computeStatus(r.monthlyActual, r.monthlyTarget) !== 'gray').length

  return (
    <tr>
      <td colSpan={10} className="bg-yanne-600 text-white font-bold text-[11px] uppercase tracking-wider py-2.5 px-4">
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
  if (!data) return <p className="text-sm text-text-muted">Failed to load scorecard</p>

  const revPct = data.revenueTarget > 0 ? Math.round((data.revenueCollected / data.revenueTarget) * 100) : 0
  const revBarColor = revPct >= 70 ? 'bg-emerald-500' : revPct >= 40 ? 'bg-amber-400' : 'bg-red-500'

  function updateLocalRow(idx: number, column: string, newVal: string) {
    setLocalRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [column]: newVal }
      return next
    })
  }

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

  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/1kS3K2rVXpXbqhrlCeBU8PEu5CnaOtFPGY_XfvE7G0mo/edit`

  return (
    <div className="max-w-[1400px] mx-auto print:max-w-none space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary tracking-tight">Growth Scorecard</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-text-muted">{currentMonth} &middot; Goals tracked weekly, revenue monthly</p>
            <span className="text-[10px] text-text-faint font-data">Refreshed {data.lastRefreshed}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3h-15A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3ZM9 17H7v-2h2v2Zm0-4H7v-2h2v2Zm0-4H7V7h2v2Zm4 8h-2v-2h2v2Zm0-4h-2v-2h2v2Zm0-4h-2V7h2v2Zm4 8h-2v-2h2v2Zm0-4h-2v-2h2v2Zm0-4h-2V7h2v2Z"/></svg>
            Open Google Sheet
          </a>
          <button onClick={saveSnapshot} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken transition-colors">Snapshot</button>
          <button onClick={() => setShowTargets(true)} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken transition-colors">Edit Targets</button>
          <button
            onClick={async () => {
              const r = await apiFetch('/api/digest/send', { method: 'POST' })
              if (r.ok) toast('Digest sent to Slack', 'success')
              else toast('Failed to send digest', 'error')
            }}
            className="rounded-lg bg-yanne-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-yanne-400 transition-colors"
          >Send Digest</button>
          <button onClick={syncNow} disabled={syncing} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-sunken disabled:opacity-50 transition-colors">
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        <TargetsModal open={showTargets} onClose={() => setShowTargets(false)} onSaved={refresh} />
      </div>

      {/* ── NORTH STAR ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm text-center">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Monthly Revenue Target</div>
        <div className="text-4xl font-bold text-text-primary tabular-nums">
          ${(data.revenueCollected / 1000).toFixed(0)}K
          <span className="text-lg font-normal text-text-muted ml-2">/ ${((data.revenueTarget || 833000) / 1000).toFixed(0)}K monthly target</span>
        </div>
        <div className="mt-3 mx-auto max-w-xl">
          <div className="h-3 rounded-full bg-surface-sunken overflow-hidden">
            <div className={`h-full rounded-full ${revBarColor} transition-all`} style={{ width: `${Math.min(revPct, 100)}%` }} />
          </div>
          <div className="text-xs text-text-muted mt-1.5 tabular-nums">{revPct}% of target ($10M annual run rate)</div>
        </div>
        <div className="mt-4 flex justify-center gap-8">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Qualification Rate</div>
            <div className={`text-xl font-bold tabular-nums ${data.qualificationRate >= 30 ? 'text-emerald-600' : data.qualificationRate >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
              {data.qualificationRate}%
            </div>
            <div className="text-[9px] text-text-faint">showed → progressed</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Working Days</div>
            <div className="text-xl font-bold tabular-nums text-text-primary">{data.workingDaysSoFar} <span className="text-sm font-normal text-text-muted">/ {data.workingDaysInMonth}</span></div>
            <div className="text-[9px] text-text-faint">this month (excl. weekends)</div>
          </div>
        </div>
      </div>

      {/* ── FUNNEL FLOW ──────────────────────────── */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-3">Monthly Pipeline Flow</div>
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
                  <div className="text-[9px] text-text-secondary uppercase tracking-wider mt-0.5 font-medium">{stage.label}</div>
                  <div className="text-[8px] text-text-muted tabular-nums">tgt: {stage.target >= 1000 ? `${(stage.target / 1000).toFixed(0)}K` : stage.target}</div>
                </div>
                {i < data.funnel.length - 1 && (
                  <div className="flex flex-col items-center mx-0.5 shrink-0">
                    <svg className="w-5 h-5 text-text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
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
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b-2 border-yanne-500 bg-surface-sunken">
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
                      <td colSpan={10} className="bg-yanne-50 font-semibold text-xs text-yanne-600 py-2 px-4 border-b border-yanne-100">
                        {row.metric}
                      </td>
                    </tr>
                  )
                }

                const status = computeStatus(row.monthlyActual, row.monthlyTarget)
                const trend = computeTrend(row)
                const rowBg = status === 'red' ? 'bg-red-50/50' : status === 'yellow' ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-surface-sunken/50'

                return (
                  <tr key={`row-${idx}`} className={`border-b border-border-muted hover:bg-yanne-50/50 transition-colors ${rowBg}`}>
                    <td className="py-1.5 px-4 text-xs text-text-primary font-medium">{row.metric}</td>
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
                    <EditableCell value={row.owner} rowIndex={row.rowIndex} column="owner" tab={data.sheetTab} editable={true} onSaved={v => updateLocalRow(idx, 'owner', v)} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REP LEADERBOARD ──────────────────────── */}
      {data.repLeaderboard.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-primary">Rep Leaderboard (Weekly)</h3>
            <div className="flex gap-4 text-[10px] text-text-muted">
              <span>Top Theme: <span className="text-text-secondary font-medium">{data.topCoachingTheme}</span></span>
              <span>Weakest: <span className="text-text-secondary font-medium">{data.worstCategory}</span></span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b border-border">
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
                  <tr key={r.name} className={`border-b border-border-muted ${bg}`}>
                    <td className="py-2 text-sm">{medal}</td>
                    <td className="py-2 text-xs font-semibold text-text-primary">{r.name}</td>
                    <td className="py-2 text-xs text-text-secondary text-right tabular-nums">{r.calls}</td>
                    <td className={`py-2 text-xs font-bold text-right tabular-nums ${r.avgScore >= 70 ? 'text-emerald-600' : r.avgScore >= 55 ? 'text-amber-600' : 'text-red-600'}`}>{r.avgScore}%</td>
                    <td className="py-2 text-xs text-text-secondary text-right tabular-nums">{r.dealsAdvanced}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BOTTLENECK ─────────────────────────────── */}
      {data.bottleneck && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
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
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-text-primary mb-3">Alerts</h3>
        <div className="space-y-3">
          {data.alerts.filter(a => a.level === 'critical').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-600 mb-1">Critical</div>
              {data.alerts.filter(a => a.level === 'critical').map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-red-500 mt-1 shrink-0" />
                  <span className="text-xs text-red-800">{a.message}</span>
                </div>
              ))}
            </div>
          )}
          {data.alerts.filter(a => a.level === 'warning').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1">Warning</div>
              {data.alerts.filter(a => a.level === 'warning').map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                  <span className="text-xs text-amber-800">{a.message}</span>
                </div>
              ))}
            </div>
          )}
          {data.alerts.filter(a => a.level === 'win').length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Wins</div>
              {data.alerts.filter(a => a.level === 'win').map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  <span className="text-xs text-emerald-800">{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ONBOARDING PROGRESS ─────────────────────── */}
      {data.onboardingProjects.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-primary">Client Onboarding</h3>
            <span className="text-[10px] text-text-muted">{data.onboardingProjects.length} active projects</span>
          </div>
          <div className="space-y-2">
            {data.onboardingProjects.map(p => (
              <div key={p.name} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-medium text-text-primary w-32 truncate" title={p.name}>{p.name}</span>
                <div className="flex-1 h-2.5 rounded-full bg-surface-sunken overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${p.completionRate >= 80 ? 'bg-emerald-500' : p.completionRate >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    style={{ width: `${p.completionRate}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-text-primary w-10 text-right tabular-nums">{p.completionRate}%</span>
                <div className="flex gap-1">
                  {p.groups.map(g => (
                    <div key={g.title} className="w-6 text-center" title={`${g.title}: ${g.done}/${g.total}`}>
                      <div className={`text-[9px] font-bold ${g.done === g.total ? 'text-emerald-600' : g.done > 0 ? 'text-blue-600' : 'text-text-faint'}`}>
                        {g.done}/{g.total}
                      </div>
                    </div>
                  ))}
                </div>
                {p.overdueTasks > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{p.overdueTasks} late</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── OVERDUE TASKS ───────────────────────────── */}
      {data.overdueTasks.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-red-700">Overdue Onboarding Tasks</h3>
            <NotifySlackButton />
          </div>
          <div className="space-y-1">
            {data.overdueTasks.slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">{t.projectName}</span>
                  <span className="text-[10px] text-text-muted">{t.group}</span>
                  <span className="text-xs text-text-secondary">{t.taskName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted">{t.owner}</span>
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{t.daysOverdue}d</span>
                </div>
              </div>
            ))}
            {data.overdueTasks.length > 8 && (
              <p className="text-[10px] text-text-muted pt-1">...and {data.overdueTasks.length - 8} more</p>
            )}
          </div>
        </div>
      )}

      {/* ── WEEKLY COMPARISON ──────────────────────── */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-text-primary mb-3">This Week vs Last Week</h3>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b border-border">
              <th className="text-left pb-2">Metric</th>
              <th className="text-right pb-2">This Week</th>
              <th className="text-right pb-2">Last Week</th>
              <th className="text-right pb-2">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.weeklyComparison.map(row => (
              <tr key={row.metric} className="border-b border-border-muted">
                <td className="py-2 text-xs text-text-secondary">{row.metric}</td>
                <td className="py-2 text-xs font-semibold text-text-primary text-right tabular-nums">{row.thisWeek}</td>
                <td className="py-2 text-xs text-text-muted text-right tabular-nums">{row.lastWeek}</td>
                <td className={`py-2 text-xs font-semibold text-right tabular-nums ${
                  String(row.change).startsWith('+') ? 'text-emerald-600' :
                  String(row.change).startsWith('-') ? 'text-red-600' : 'text-text-muted'
                }`}>{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
