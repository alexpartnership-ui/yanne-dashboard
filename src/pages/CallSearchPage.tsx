import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useAuth'
import { Spinner } from '../components/Spinner'

interface SearchResult {
  id: string
  rep: string
  call_type: string
  prospect_company: string | null
  date: string | null
  score_percentage: number
  grade: string | null
  coaching_priority: string | null
  biggest_miss: string | null
  objections: string[]
  red_flags: string[]
  qualification_result: string | null
  pipeline_inflation: boolean
  call_outcome: string | null
}

function scoreColor(s: number) {
  return s >= 70 ? 'text-emerald-600' : s >= 55 ? 'text-amber-600' : 'text-red-600'
}

function gradeColor(g: string) {
  const l = g.charAt(0)
  if (l === 'A') return 'bg-emerald-100 text-emerald-700'
  if (l === 'B') return 'bg-blue-100 text-blue-700'
  if (l === 'C') return 'bg-amber-100 text-amber-700'
  if (l === 'D') return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

export function CallSearchPage() {
  const [query, setQuery] = useState('')
  const [rep, setRep] = useState('')
  const [callType, setCallType] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const navigate = useNavigate()

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams({ q: query.trim() })
      if (rep) params.set('rep', rep)
      if (callType) params.set('call_type', callType)
      const res = await apiFetch(`/api/call-search?${params}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results || [])
        setTotal(data.totalMatches || 0)
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  const suggestions = [
    'fee objection', 'retainer', 'pricing', 'timeline', 'decision maker',
    'pipeline inflation', 'NOT_QUALIFIED', 'DEAD_END', 'capital raise',
    'board approval', 'competitor', 'budget', 'due diligence',
  ]

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[#1A3C34]">Call Library</h2>
        <p className="text-xs text-zinc-400 mt-0.5">Search across all scored calls — objections, coaching, company names, red flags</p>
      </div>

      {/* Search bar */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search calls... (e.g. 'fee objection', 'retainer', company name)"
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-[#1A3C34] focus:outline-none shadow-sm"
          autoFocus
        />
        <select value={rep} onChange={e => setRep(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 shadow-sm">
          <option value="">All Reps</option>
          <option value="Jake">Jake</option>
          <option value="Stanley">Stanley</option>
          <option value="Thomas">Thomas</option>
          <option value="Tahawar">Tahawar</option>
        </select>
        <select value={callType} onChange={e => setCallType(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 shadow-sm">
          <option value="">All Types</option>
          <option value="Call 1">Call 1</option>
          <option value="Call 2">Call 2</option>
          <option value="Call 3">Call 3</option>
          <option value="Misc">Misc</option>
        </select>
        <button onClick={search} disabled={loading || !query.trim()} className="rounded-lg bg-[#1A3C34] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1A3C34]/90 disabled:opacity-40 shadow-sm">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Quick suggestions */}
      {!searched && (
        <div className="mb-6">
          <p className="text-xs text-zinc-400 mb-2">Quick searches:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button key={s} onClick={() => { setQuery(s); setTimeout(search, 50) }}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:border-[#A8C4BB] hover:bg-[#A8C4BB]/10 transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {searched && (
        <div className="mb-3 text-xs text-zinc-500">
          {total} call{total !== 1 ? 's' : ''} found for "{query}"
          {rep && ` (${rep})`}{callType && ` (${callType})`}
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {results.map(c => (
            <div
              key={c.id}
              onClick={() => navigate(`/calls/${c.id}`)}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-[#A8C4BB] cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-800">{c.prospect_company || 'Unknown'}</span>
                  <span className="text-xs text-zinc-400">{c.rep} — {c.call_type}</span>
                  <span className="text-xs text-zinc-400">{c.date?.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${scoreColor(c.score_percentage)}`}>{c.score_percentage}%</span>
                  {c.grade && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gradeColor(c.grade)}`}>{c.grade}</span>}
                  {c.pipeline_inflation && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">INFLATION</span>}
                </div>
              </div>
              {c.coaching_priority && (
                <p className="text-xs text-zinc-600 line-clamp-2 mb-1">
                  <span className="font-semibold text-zinc-500">Coaching:</span> {c.coaching_priority}
                </p>
              )}
              {c.biggest_miss && (
                <p className="text-xs text-zinc-500 line-clamp-1">
                  <span className="font-semibold">Miss:</span> {c.biggest_miss}
                </p>
              )}
              {c.objections && c.objections.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {c.objections.slice(0, 3).map((o, i) => (
                    <span key={i} className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">{o.slice(0, 60)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
