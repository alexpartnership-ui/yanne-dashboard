import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

// ─── Types ──────────────────────────────────────────────

interface CadenceInvestor {
  investor_name: string;
  investor_type: string | null;
  relationship_status: string | null;
  relationship_owner: string | null;
  relationship_tier: string | null;
  last_contact_date: string | null;
  meetings_count: number | null;
  primary_contact: string | null;
  client_pitched_to: string | null;
}

// ─── Helpers ────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function fmtDate(d: string | null): string {
  if (!d) return '\u2014'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '\u2014'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function urgencyColor(days: number | null): string {
  if (days == null) return 'bg-zinc-100 text-zinc-500'
  if (days <= 14) return 'bg-emerald-50 text-emerald-700'
  if (days <= 30) return 'bg-blue-50 text-blue-700'
  if (days <= 60) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function urgencyLabel(days: number | null): string {
  if (days == null) return 'Never contacted'
  if (days <= 14) return `${days}d ago`
  if (days <= 60) return `${days}d \u2014 follow up`
  return `${days}d \u2014 overdue`
}

function tierPill(tier: string | null) {
  const map: Record<string, string> = {
    A: 'bg-emerald-50 text-emerald-700',
    B: 'bg-blue-50 text-blue-700',
    C: 'bg-amber-50 text-amber-700',
  }
  const label = tier || 'Untiered'
  const cls = map[label] || 'bg-zinc-100 text-zinc-500'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
}

// ─── Component ──────────────────────────────────────────

export function InvestorCadencePage() {
  const [investors, setInvestors] = useState<CadenceInvestor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState('')

  useEffect(() => {
    apiFetch('/api/investors?select=investor_name,investor_type,relationship_status,relationship_owner,relationship_tier,last_contact_date,meetings_count,primary_contact,client_pitched_to')
      .then(r => r.json())
      .then((data: CadenceInvestor[]) => { setInvestors(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const owners = useMemo(() => [...new Set(investors.map(i => i.relationship_owner).filter(Boolean))] as string[], [investors])

  const sorted = useMemo(() => {
    let arr = investors
    if (ownerFilter) arr = arr.filter(i => i.relationship_owner === ownerFilter)
    return [...arr].sort((a, b) => {
      const da = daysSince(a.last_contact_date)
      const db = daysSince(b.last_contact_date)
      // Contacted investors sorted by most overdue first, never contacted at bottom
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return db - da
    })
  }, [investors, ownerFilter])

  // KPIs
  const overdueCount = useMemo(() => investors.filter(i => {
    const d = daysSince(i.last_contact_date)
    return d != null && d > 60
  }).length, [investors])

  const followUpCount = useMemo(() => investors.filter(i => {
    const d = daysSince(i.last_contact_date)
    return d != null && d > 30 && d <= 60
  }).length, [investors])

  const neverContacted = useMemo(() => investors.filter(i => !i.last_contact_date).length, [investors])

  const totalMeetings = useMemo(() => investors.reduce((s, i) => s + (i.meetings_count || 0), 0), [investors])

  if (loading) return <Spinner />
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900">Investor Cadence Tracker</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Overdue (60d+)" value={overdueCount} subtitle="Need immediate outreach" />
        <MetricCard label="Follow Up (30\u201360d)" value={followUpCount} subtitle="Schedule touch point" />
        <MetricCard label="Never Contacted" value={neverContacted} />
        <MetricCard label="Total Meetings" value={totalMeetings} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700">
          <option value="">All Owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span className="text-xs text-zinc-400">{sorted.length} investor{sorted.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left">
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Investor</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Contact</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Tier</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Owner</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Last Contact</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Urgency</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 text-right">Meetings</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Pitched To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sorted.map(inv => {
              const days = daysSince(inv.last_contact_date)
              return (
                <tr key={inv.investor_name} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-zinc-900">{inv.investor_name}</div>
                    {inv.investor_type && <div className="text-[11px] text-zinc-400">{inv.investor_type}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{inv.primary_contact || '\u2014'}</td>
                  <td className="px-3 py-2.5">{tierPill(inv.relationship_tier)}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{inv.relationship_owner || '\u2014'}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{fmtDate(inv.last_contact_date)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgencyColor(days)}`}>
                      {urgencyLabel(days)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-700">{inv.meetings_count ?? 0}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{inv.client_pitched_to || '\u2014'}</td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">No investors found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
