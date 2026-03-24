import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

// ─── Types ──────────────────────────────────────────────

interface Investor {
  id: string | null;
  investor_name: string; investor_type: string | null; sub_type: string | null;
  website: string | null; linkedin_page: string | null;
  hq_city: string | null; hq_country: string | null; aum_millions: number | null;
  industries_sectors: string[] | null; geographic_focus: string | null;
  ticket_min_millions: number | null; ticket_max_millions: number | null;
  investment_thesis: string | null;
  exclusions: string | null; stage_preference: string | null; series_preference: string | null;
  revenue_preference: string | null; valuation_preference: string | null; board_seat_required: boolean | null;
  // PE / Equity
  pe_transaction_type: string | null; ebitda_min_millions: number | null; ebitda_max_millions: number | null;
  control_preference: string | null; platform_vs_addon: string | null; leverage_appetite: string | null;
  // Credit / Debt
  credit_transaction_type: string | null; facility_size_min_millions: number | null; facility_size_max_millions: number | null;
  interest_type: string | null; collateral_required: string | null; covenant_style: string | null; loan_to_value_max: number | null;
  // LP / Co-invest
  direct_vs_coinvest: string | null; lp_commitments: string | null; mandate_restrictions: string | null; esg_requirements: string | null;
  // Relationship
  relationship_status: string | null; relationship_owner: string | null; relationship_tier: string | null;
  last_contact_date: string | null; meetings_count: number | null;
  follow_on_rate_pct: number | null; next_follow_up: string | null;
  // Contacts
  primary_contact: string | null; primary_title: string | null; primary_email: string | null; primary_linkedin: string | null; primary_phone: string | null;
  secondary_contact: string | null; secondary_title: string | null; secondary_email: string | null;
  key_decision_maker: string | null; assistant_ea: string | null;
  // Process
  decision_process: string | null; dd_requirements: string | null; timeline_to_close: string | null;
  // Track record
  portfolio_size: number | null; notable_portfolio_cos: string | null; recent_deals_12mo: string | null;
  avg_check_size_millions: number | null; client_pitched_to: string | null; intro_source: string | null; notes: string | null;
  // Meta
  source: string | null; created_at: string | null; updated_at: string | null;
}

type SortKey = 'investor_name' | 'aum_millions' | 'relationship_tier' | 'last_contact_date'
type SortDir = 'asc' | 'desc'

// ─── Helpers ────────────────────────────────────────────

function isAutoCaptured(source: string | null): boolean {
  return (source || '').toLowerCase().includes('auto-capture')
}

function isRecentlyAdded(date: string | null): boolean {
  if (!date) return false
  const d = new Date(date)
  if (isNaN(d.getTime())) return false
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return d >= sevenDaysAgo
}

function Field({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display = value == null || value === '' ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div>
      <div className="text-[11px] text-zinc-400 mb-0.5">{label}</div>
      <div className="text-sm text-zinc-700">{display}</div>
    </div>
  )
}

function fmtAum(m: number | null): string {
  if (m == null) return '\u2014'
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`
  return `$${m.toFixed(0)}M`
}

function fmtDate(d: string | null): string {
  if (!d) return '\u2014'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '\u2014'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ensureUrl(url: string | null): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return 'https://' + url
}

const TYPE_ABBREV: Record<string, string> = {
  'Venture Capital': 'VC', 'Private Equity': 'PE', 'Private Credit': 'PC',
  'Family Office': 'FO', 'Sovereign Wealth': 'SW', 'Hedge Fund': 'HF', 'Corporate Venture': 'CV',
}

function typeBadge(t: string | null) {
  if (!t) return <span className="text-zinc-400">{'\u2014'}</span>
  const abbr = TYPE_ABBREV[t] || t.slice(0, 2).toUpperCase()
  return <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">{abbr}</span>
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

function statusPill(status: string | null) {
  const map: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700',
    'Active - NDA Stage': 'bg-emerald-50 text-emerald-700',
    'Active Dialogue': 'bg-teal-50 text-teal-700',
    Warm: 'bg-amber-50 text-amber-700',
    Cold: 'bg-blue-50 text-blue-700',
    Lost: 'bg-zinc-100 text-zinc-400',
    New: 'bg-yanne/10 text-yanne',
  }
  if (!status) return <span className="text-zinc-400">{'\u2014'}</span>
  const cls = map[status] || 'bg-zinc-100 text-zinc-500'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>
}


function sourceBadge(source: string | null) {
  if (isAutoCaptured(source)) {
    return <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">AUTO</span>
  }
  return <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Manual</span>
}
function sortInvestors(arr: Investor[], key: SortKey, dir: SortDir): Investor[] {
  return [...arr].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (key) {
      case 'investor_name': av = a.investor_name.toLowerCase(); bv = b.investor_name.toLowerCase(); break
      case 'aum_millions': av = a.aum_millions ?? -1; bv = b.aum_millions ?? -1; break
      case 'relationship_tier': {
        const order: Record<string, number> = { A: 0, B: 1, C: 2 }
        av = order[a.relationship_tier || ''] ?? 3; bv = order[b.relationship_tier || ''] ?? 3; break
      }
      case 'last_contact_date': av = a.last_contact_date ?? ''; bv = b.last_contact_date ?? ''; break
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

// ─── Detail Tabs ────────────────────────────────────────────────

const DETAIL_TABS = [
  { key: 'mandate', label: 'Mandate' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'track_record', label: 'Track Record' },
  { key: 'pe_equity', label: 'PE/Equity' },
  { key: 'credit_debt', label: 'Credit/Debt' },
  { key: 'notes_process', label: 'Notes & Process' },
] as const

function DetailTabContent({ inv, tab }: { inv: Investor; tab: string }) {
  switch (tab) {
    case 'mandate':
      return (
        <div className="space-y-4">
          {inv.investment_thesis && (
            <div>
              <div className="text-[11px] text-zinc-400 mb-0.5">Thesis</div>
              <div className="text-sm text-zinc-700">{inv.investment_thesis}</div>
            </div>
          )}
          {inv.industries_sectors && inv.industries_sectors.length > 0 && (
            <div>
              <div className="text-[11px] text-zinc-400 mb-1">Sectors</div>
              <div className="flex flex-wrap gap-1">
                {inv.industries_sectors.map(s => (
                  <span key={s} className="inline-flex rounded-full bg-yanne/10 text-yanne px-2 py-0.5 text-[10px] font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Field label="Geo Focus" value={inv.geographic_focus} />
            <Field label="AUM" value={inv.aum_millions != null ? fmtAum(inv.aum_millions) : null} />
            <Field label="Ticket Range" value={inv.ticket_min_millions != null && inv.ticket_max_millions != null ? `$${inv.ticket_min_millions}M–$${inv.ticket_max_millions}M` : null} />
            <Field label="Stage Preference" value={inv.stage_preference} />
            <Field label="Series Preference" value={inv.series_preference} />
            <Field label="Revenue Preference" value={inv.revenue_preference} />
            <Field label="Valuation Preference" value={inv.valuation_preference} />
            <Field label="Board Seat Required" value={inv.board_seat_required} />
            <Field label="Direct vs Co-invest" value={inv.direct_vs_coinvest} />
            <Field label="Exclusions" value={inv.exclusions} />
            <Field label="Mandate Restrictions" value={inv.mandate_restrictions} />
            <Field label="ESG Requirements" value={inv.esg_requirements} />
          </div>
        </div>
      )

    case 'contacts':
      return (
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Primary Contact</h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Field label="Name" value={inv.primary_contact} />
              <Field label="Title" value={inv.primary_title} />
              <div>
                <div className="text-[11px] text-zinc-400 mb-0.5">Email</div>
                {inv.primary_email ? <a href={`mailto:${inv.primary_email}`} className="text-sm text-yanne hover:underline">{inv.primary_email}</a> : <div className="text-sm text-zinc-700">{'—'}</div>}
              </div>
              <Field label="Phone" value={inv.primary_phone} />
              <div>
                <div className="text-[11px] text-zinc-400 mb-0.5">LinkedIn</div>
                {inv.primary_linkedin ? <a href={ensureUrl(inv.primary_linkedin)} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">Profile</a> : <div className="text-sm text-zinc-700">{'—'}</div>}
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Secondary Contact</h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Field label="Name" value={inv.secondary_contact} />
              <Field label="Title" value={inv.secondary_title} />
              <div>
                <div className="text-[11px] text-zinc-400 mb-0.5">Email</div>
                {inv.secondary_email ? <a href={`mailto:${inv.secondary_email}`} className="text-sm text-yanne hover:underline">{inv.secondary_email}</a> : <div className="text-sm text-zinc-700">{'—'}</div>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Field label="Key Decision Maker" value={inv.key_decision_maker} />
            <Field label="Assistant / EA" value={inv.assistant_ea} />
            <Field label="Owner" value={inv.relationship_owner} />
            <Field label="Intro Source" value={inv.intro_source} />
            <Field label="Last Contact" value={fmtDate(inv.last_contact_date)} />
            <Field label="Next Follow-Up" value={fmtDate(inv.next_follow_up)} />
            <Field label="Meetings" value={inv.meetings_count ?? 0} />
            <Field label="Client Pitched" value={inv.client_pitched_to} />
          </div>
        </div>
      )

    case 'track_record':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Field label="Portfolio Size" value={inv.portfolio_size} />
            <Field label="Avg Check Size" value={inv.avg_check_size_millions != null ? `$${inv.avg_check_size_millions}M` : null} />
            <Field label="Follow-On Rate" value={inv.follow_on_rate_pct != null ? `${inv.follow_on_rate_pct}%` : null} />
          </div>
          {inv.notable_portfolio_cos && (
            <div>
              <div className="text-[11px] text-zinc-400 mb-0.5">Notable Portfolio</div>
              <div className="text-sm text-zinc-700">{inv.notable_portfolio_cos}</div>
            </div>
          )}
          {inv.recent_deals_12mo && (
            <div>
              <div className="text-[11px] text-zinc-400 mb-0.5">Recent Deals (12mo)</div>
              <div className="text-sm text-zinc-700">{inv.recent_deals_12mo}</div>
            </div>
          )}
        </div>
      )

    case 'pe_equity':
      return (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Field label="Transaction Type" value={inv.pe_transaction_type} />
          <Field label="EBITDA Range" value={inv.ebitda_min_millions != null && inv.ebitda_max_millions != null ? `$${inv.ebitda_min_millions}M–$${inv.ebitda_max_millions}M` : null} />
          <Field label="Control Preference" value={inv.control_preference} />
          <Field label="Platform vs Add-on" value={inv.platform_vs_addon} />
          <Field label="Leverage Appetite" value={inv.leverage_appetite} />
          <Field label="Sub-Type" value={inv.sub_type} />
        </div>
      )

    case 'credit_debt':
      return (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Field label="Transaction Type" value={inv.credit_transaction_type} />
          <Field label="Facility Size Range" value={inv.facility_size_min_millions != null && inv.facility_size_max_millions != null ? `$${inv.facility_size_min_millions}M–$${inv.facility_size_max_millions}M` : null} />
          <Field label="Interest Type" value={inv.interest_type} />
          <Field label="Collateral Required" value={inv.collateral_required} />
          <Field label="Covenant Style" value={inv.covenant_style} />
          <Field label="Max LTV" value={inv.loan_to_value_max != null ? `${inv.loan_to_value_max}%` : null} />
        </div>
      )

    case 'notes_process':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Field label="Decision Process" value={inv.decision_process} />
            <Field label="DD Requirements" value={inv.dd_requirements} />
            <Field label="Timeline to Close" value={inv.timeline_to_close} />
            <Field label="Source" value={inv.source} />
            <Field label="Created" value={fmtDate(inv.created_at)} />
            <Field label="Updated" value={fmtDate(inv.updated_at)} />
          </div>
          {inv.notes && (
            <div>
              <div className="text-[11px] text-zinc-400 mb-0.5">Notes</div>
              <div className="text-sm text-zinc-600 bg-zinc-50 rounded p-2">{inv.notes}</div>
            </div>
          )}
        </div>
      )

    default:
      return null
  }
}


// ─── Component ──────────────────────────────────────────

export function InvestorDatabasePage() {
  const [investors, setInvestors] = useState<Investor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('investor_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('mandate')

  useEffect(() => {
    apiFetch('/api/investors')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load investors')))
      .then(data => { setInvestors(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const types = useMemo(() => [...new Set(investors.map(i => i.investor_type).filter(Boolean))] as string[], [investors])
  const tiers = ['A', 'B', 'C', 'Untiered']
  const statuses = useMemo(() => [...new Set(investors.map(i => i.relationship_status).filter(Boolean))] as string[], [investors])
  const sources = useMemo(() => [...new Set(investors.map(i => isAutoCaptured(i.source) ? 'Auto-Capture' : 'Manual'))] as string[], [investors])

  const filtered = useMemo(() => {
    let arr = investors
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter(i => i.investor_name.toLowerCase().includes(q) || (i.primary_contact || '').toLowerCase().includes(q))
    }
    if (typeFilter) arr = arr.filter(i => i.investor_type === typeFilter)
    if (tierFilter) {
      if (tierFilter === 'Untiered') arr = arr.filter(i => !i.relationship_tier)
      else arr = arr.filter(i => i.relationship_tier === tierFilter)
    }
    if (statusFilter) arr = arr.filter(i => i.relationship_status === statusFilter)
    if (sourceFilter) {
      if (sourceFilter === 'Auto-Capture') arr = arr.filter(i => isAutoCaptured(i.source))
      else arr = arr.filter(i => !isAutoCaptured(i.source))
    }
    return sortInvestors(arr, sortKey, sortDir)
  }, [investors, search, typeFilter, tierFilter, statusFilter, sourceFilter, sortKey, sortDir])

  const totalAum = useMemo(() => investors.reduce((s, i) => s + (i.aum_millions || 0), 0), [investors])
  const tierACount = useMemo(() => investors.filter(i => i.relationship_tier === 'A').length, [investors])
  const avgCheck = useMemo(() => {
    const checks = investors.filter(i => i.avg_check_size_millions != null)
    return checks.length > 0 ? checks.reduce((s, i) => s + (i.avg_check_size_millions || 0), 0) / checks.length : 0
  }, [investors])
  const autoCapturedCount = useMemo(() => investors.filter(i => isAutoCaptured(i.source)).length, [investors])
  const recentCount = useMemo(() => investors.filter(i => isRecentlyAdded(i.last_contact_date)).length, [investors])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-zinc-300 ml-1">{'\u2195'}</span>
    return <span className="text-yanne ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  function clearFilters() {
    setSearch(''); setTypeFilter(''); setTierFilter(''); setStatusFilter(''); setSourceFilter('')
  }

  const hasFilters = search || typeFilter || tierFilter || statusFilter || sourceFilter

  if (loading) return <Spinner />
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>

  const expanded = expandedId ? investors.find(i => i.investor_name === expandedId) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-zinc-900">Investor Database</h1><a href="https://docs.google.com/spreadsheets/d/15SvA_bLQ_MaxKAkcECuPP_S9HiONYAeElfjx14JWEmQ/edit" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">Open Google Sheet <span className="text-xs">↗</span></a></div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-4">
        <MetricCard label="Total Investors" value={investors.length} />
        <MetricCard label="Tier A" value={tierACount} />
        <MetricCard label="Combined AUM" value={fmtAum(totalAum)} />
        <MetricCard label="Avg Check Size" value={`$${avgCheck.toFixed(1)}M`} />
        <MetricCard label="Auto-Captured" value={autoCapturedCount} subtitle="via Fireflies" />
        <MetricCard label="Last 7 Days" value={recentCount} subtitle="new/updated" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text" placeholder="Search investor or contact..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-yanne/30 w-64"
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700">
          <option value="">All Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700">
          <option value="">All Tiers</option>
          {tiers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700">
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700">
          <option value="">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-zinc-500 hover:text-zinc-700 underline">Clear filters</button>
        )}
        <span className="ml-auto text-xs text-zinc-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left">
              <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer" onClick={() => toggleSort('investor_name')}>
                Investor{sortArrow('investor_name')}
              </th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Type</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">HQ</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 text-right cursor-pointer" onClick={() => toggleSort('aum_millions')}>
                AUM{sortArrow('aum_millions')}
              </th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 text-right">Ticket Range</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer" onClick={() => toggleSort('relationship_tier')}>
                Tier{sortArrow('relationship_tier')}
              </th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Status</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Owner</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer" onClick={() => toggleSort('last_contact_date')}>
                Last Contact{sortArrow('last_contact_date')}
              </th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map(inv => (
              <tr
                key={inv.investor_name}
                className={`hover:bg-zinc-50 cursor-pointer transition-colors ${expandedId === inv.investor_name ? 'bg-yanne/5' : ''}`}
                onClick={() => { setExpandedId(expandedId === inv.investor_name ? null : inv.investor_name); setActiveTab('mandate') }}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5"><span className="font-medium text-zinc-900">{inv.investor_name}</span>{isRecentlyAdded(inv.created_at) && (<span className="inline-flex items-center rounded-full bg-yanne/10 text-yanne px-1.5 py-0.5 text-[9px] font-bold">NEW</span>)}</div>
                  {inv.primary_contact && <div className="text-[11px] text-zinc-400">{inv.primary_contact}</div>}
                  <div className="flex gap-2 mt-0.5">
                    {inv.website && <a href={ensureUrl(inv.website)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-yanne hover:underline">{'\ud83c\udf10'}</a>}
                    {inv.linkedin_page && <a href={ensureUrl(inv.linkedin_page)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-blue-600 hover:underline">in</a>}
                  </div>
                </td>
                <td className="px-3 py-2.5">{typeBadge(inv.investor_type)}</td>
                <td className="px-3 py-2.5 text-zinc-600">
                  {inv.hq_city || inv.hq_country ? `${inv.hq_city || ''}${inv.hq_city && inv.hq_country ? ', ' : ''}${inv.hq_country || ''}` : '\u2014'}
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-zinc-700">{fmtAum(inv.aum_millions)}</td>
                <td className="px-3 py-2.5 text-right text-zinc-600">
                  {inv.ticket_min_millions != null && inv.ticket_max_millions != null
                    ? `$${inv.ticket_min_millions}M\u2013$${inv.ticket_max_millions}M`
                    : '\u2014'}
                </td>
                <td className="px-3 py-2.5">{tierPill(inv.relationship_tier)}</td>
                <td className="px-3 py-2.5">{statusPill(inv.relationship_status)}</td>
                <td className="px-3 py-2.5 text-zinc-600">{inv.relationship_owner || '\u2014'}</td>
                <td className="px-3 py-2.5 text-zinc-600">{fmtDate(inv.last_contact_date)}</td>
                <td className="px-3 py-2.5">{sourceBadge(inv.source)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-zinc-400">No investors match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expandable Detail Panel -- Tabbed */}
      {expanded && (
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-lg font-bold text-zinc-900">{expanded.investor_name}</h2>
            <button onClick={() => setExpandedId(null)} className="text-zinc-400 hover:text-zinc-600 text-sm">{'✕'} Close</button>
          </div>

          {/* Tab Bar */}
          <div className="border-b border-zinc-200 px-6">
            <nav className="flex gap-6 -mb-px">
              {DETAIL_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-yanne text-yanne'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            <DetailTabContent inv={expanded} tab={activeTab} />
          </div>
        </div>
      )}
    </div>
  )
}
