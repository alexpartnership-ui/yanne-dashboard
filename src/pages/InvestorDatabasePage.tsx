import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

// ─── Types ──────────────────────────────────────────────

interface Investor {
  investor_name: string; investor_type: string | null; sub_type: string | null;
  website: string | null; linkedin_page: string | null;
  hq_city: string | null; hq_country: string | null; aum_millions: number | null;
  industries_sectors: string[] | null; geographic_focus: string | null;
  ticket_min_millions: number | null; ticket_max_millions: number | null;
  investment_thesis: string | null;
  relationship_status: string | null; relationship_owner: string | null; relationship_tier: string | null;
  last_contact_date: string | null; meetings_count: number | null;
  primary_contact: string | null; primary_title: string | null; primary_email: string | null; primary_linkedin: string | null;
  portfolio_size: number | null; notable_portfolio_cos: string | null; recent_deals_12mo: string | null;
  avg_check_size_millions: number | null; client_pitched_to: string | null; intro_source: string | null; notes: string | null;
}

type SortKey = 'investor_name' | 'aum_millions' | 'relationship_tier' | 'last_contact_date'
type SortDir = 'asc' | 'desc'

// ─── Helpers ────────────────────────────────────────────

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
    Warm: 'bg-amber-50 text-amber-700',
    Cold: 'bg-blue-50 text-blue-700',
    Lost: 'bg-zinc-100 text-zinc-400',
    New: 'bg-yanne/10 text-yanne',
  }
  if (!status) return <span className="text-zinc-400">{'\u2014'}</span>
  const cls = map[status] || 'bg-zinc-100 text-zinc-500'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>
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

// ─── Component ──────────────────────────────────────────

export function InvestorDatabasePage() {
  const [investors, setInvestors] = useState<Investor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('investor_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/investors')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load investors')))
      .then(data => { setInvestors(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const types = useMemo(() => [...new Set(investors.map(i => i.investor_type).filter(Boolean))] as string[], [investors])
  const tiers = ['A', 'B', 'C', 'Untiered']
  const statuses = useMemo(() => [...new Set(investors.map(i => i.relationship_status).filter(Boolean))] as string[], [investors])

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
    return sortInvestors(arr, sortKey, sortDir)
  }, [investors, search, typeFilter, tierFilter, statusFilter, sortKey, sortDir])

  const totalAum = useMemo(() => investors.reduce((s, i) => s + (i.aum_millions || 0), 0), [investors])
  const tierACount = useMemo(() => investors.filter(i => i.relationship_tier === 'A').length, [investors])
  const avgCheck = useMemo(() => {
    const checks = investors.filter(i => i.avg_check_size_millions != null)
    return checks.length > 0 ? checks.reduce((s, i) => s + (i.avg_check_size_millions || 0), 0) / checks.length : 0
  }, [investors])
  const contactedCount = useMemo(() => investors.filter(i => i.last_contact_date).length, [investors])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-zinc-300 ml-1">{'\u2195'}</span>
    return <span className="text-yanne ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  function clearFilters() {
    setSearch(''); setTypeFilter(''); setTierFilter(''); setStatusFilter('')
  }

  const hasFilters = search || typeFilter || tierFilter || statusFilter

  if (loading) return <Spinner />
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>

  const expanded = expandedId ? investors.find(i => i.investor_name === expandedId) : null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900">Investor Database</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Total Investors" value={investors.length} />
        <MetricCard label="Tier A" value={tierACount} />
        <MetricCard label="Combined AUM" value={fmtAum(totalAum)} />
        <MetricCard label="Avg Check Size" value={`$${avgCheck.toFixed(1)}M`} />
        <MetricCard label="Contacted" value={contactedCount} subtitle={`${investors.length > 0 ? ((contactedCount / investors.length) * 100).toFixed(0) : 0}% of total`} />
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
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map(inv => (
              <tr
                key={inv.investor_name}
                className={`hover:bg-zinc-50 cursor-pointer transition-colors ${expandedId === inv.investor_name ? 'bg-yanne/5' : ''}`}
                onClick={() => setExpandedId(expandedId === inv.investor_name ? null : inv.investor_name)}
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium text-zinc-900">{inv.investor_name}</div>
                  {inv.primary_contact && <div className="text-[11px] text-zinc-400">{inv.primary_contact}</div>}
                  <div className="flex gap-2 mt-0.5">
                    {inv.website && <a href={inv.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-yanne hover:underline">{'\ud83c\udf10'}</a>}
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
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400">No investors match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expandable Detail Panel */}
      {expanded && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900">{expanded.investor_name}</h2>
            <button onClick={() => setExpandedId(null)} className="text-zinc-400 hover:text-zinc-600 text-sm">{'\u2715'} Close</button>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {/* Investment Profile */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Investment Profile</h3>
              {expanded.investment_thesis && (
                <div>
                  <div className="text-[11px] text-zinc-400 mb-0.5">Thesis</div>
                  <div className="text-sm text-zinc-700">{expanded.investment_thesis}</div>
                </div>
              )}
              {expanded.industries_sectors && expanded.industries_sectors.length > 0 && (
                <div>
                  <div className="text-[11px] text-zinc-400 mb-1">Sectors</div>
                  <div className="flex flex-wrap gap-1">
                    {expanded.industries_sectors.map(s => (
                      <span key={s} className="inline-flex rounded-full bg-yanne/10 text-yanne px-2 py-0.5 text-[10px] font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-400 text-[11px]">Geo Focus</span><div className="text-zinc-700">{expanded.geographic_focus || '\u2014'}</div></div>
                <div><span className="text-zinc-400 text-[11px]">Avg Check</span><div className="text-zinc-700">{expanded.avg_check_size_millions != null ? `$${expanded.avg_check_size_millions}M` : '\u2014'}</div></div>
                <div><span className="text-zinc-400 text-[11px]">Portfolio Size</span><div className="text-zinc-700">{expanded.portfolio_size ?? '\u2014'}</div></div>
                <div><span className="text-zinc-400 text-[11px]">Sub-Type</span><div className="text-zinc-700">{expanded.sub_type || '\u2014'}</div></div>
              </div>
            </div>

            {/* Track Record */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Track Record</h3>
              {expanded.notable_portfolio_cos && (
                <div>
                  <div className="text-[11px] text-zinc-400 mb-0.5">Notable Portfolio</div>
                  <div className="text-sm text-zinc-700">{expanded.notable_portfolio_cos}</div>
                </div>
              )}
              {expanded.recent_deals_12mo && (
                <div>
                  <div className="text-[11px] text-zinc-400 mb-0.5">Recent Deals (12mo)</div>
                  <div className="text-sm text-zinc-700">{expanded.recent_deals_12mo}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-400 text-[11px]">Pitched To</span><div className="text-zinc-700">{expanded.client_pitched_to || '\u2014'}</div></div>
                <div><span className="text-zinc-400 text-[11px]">Intro Source</span><div className="text-zinc-700">{expanded.intro_source || '\u2014'}</div></div>
                <div><span className="text-zinc-400 text-[11px]">Meetings</span><div className="text-zinc-700">{expanded.meetings_count ?? 0}</div></div>
              </div>
            </div>

            {/* Contacts */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Contacts</h3>
              <div className="space-y-1 text-sm">
                <div className="font-medium text-zinc-900">{expanded.primary_contact || '\u2014'}</div>
                {expanded.primary_title && <div className="text-zinc-500 text-[11px]">{expanded.primary_title}</div>}
                {expanded.primary_email && (
                  <a href={`mailto:${expanded.primary_email}`} className="text-yanne hover:underline text-[12px] block">{expanded.primary_email}</a>
                )}
                {expanded.primary_linkedin && (
                  <a href={ensureUrl(expanded.primary_linkedin)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-[12px] block">LinkedIn Profile</a>
                )}
              </div>
              {expanded.notes && (
                <div>
                  <div className="text-[11px] text-zinc-400 mb-0.5">Notes</div>
                  <div className="text-sm text-zinc-600 bg-zinc-50 rounded p-2">{expanded.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
