import { useEffect, useState } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

interface LibMeta { sectors: string[]; angles: string[]; total: number }
interface SequenceSummary { sector: string; angle: string; set_number: number; skeleton: string; cta_type: string; subject_lines: string[] }
interface FullSequence {
  sector: string; angle: string; set_number: number; skeleton: string; cta_type: string
  subject_lines: string[]
  email_1: { body_spintax: string }
  email_2: { body_spintax: string }
  email_3: { body_spintax: string }
}

function angleColor(angle: string): string {
  if (angle === 'Investor Demand') return 'bg-blue-100 text-blue-700'
  if (angle === 'Strategic Partnership') return 'bg-violet-100 text-violet-700'
  if (angle === 'Urgency/Timing') return 'bg-amber-100 text-amber-700'
  return 'bg-surface-overlay text-text-muted'
}

export function CopyLibraryPage() {
  const [meta, setMeta] = useState<LibMeta | null>(null)
  const [sequences, setSequences] = useState<SequenceSummary[]>([])
  const [selectedSector, setSelectedSector] = useState<string>('')
  const [selectedAngle, setSelectedAngle] = useState<string>('')
  const [activeSequence, setActiveSequence] = useState<FullSequence | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  // Load metadata
  useEffect(() => {
    apiFetch('/api/copy-library/sectors').then(r => r.json()).then(setMeta).finally(() => setLoading(false))
  }, [])

  // Load filtered sequences
  useEffect(() => {
    if (!selectedSector) { setSequences([]); return }
    const params = new URLSearchParams({ sector: selectedSector })
    if (selectedAngle) params.set('angle', selectedAngle)
    apiFetch(`/api/copy-library?${params}`).then(r => r.json()).then(setSequences)
  }, [selectedSector, selectedAngle])

  // Load full sequence detail
  function viewSequence(sector: string, angle: string, set: number) {
    setDetailLoading(true)
    apiFetch(`/api/copy-library/sequence?sector=${encodeURIComponent(sector)}&angle=${encodeURIComponent(angle)}&set=${set}`)
      .then(r => r.json())
      .then(setActiveSequence)
      .finally(() => setDetailLoading(false))
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Copy Library</h2>
        <a
          href="https://yanneceodashboard.com/chat"
          className="rounded-lg bg-yanne px-4 py-2 text-sm font-medium text-white hover:bg-yanne/90 transition-colors"
        >
          /ca-copy-gen — Generate New Sequences
        </a>
      </div>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard label="Total Sequences" value={meta?.total ?? 0} />
        <MetricCard label="Sectors" value={meta?.sectors.length ?? 0} />
        <MetricCard label="Angles" value={meta?.angles.length ?? 0} />
        <MetricCard label="Sets Per Combo" value={5} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={selectedSector}
          onChange={e => { setSelectedSector(e.target.value); setActiveSequence(null) }}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary focus:border-yanne focus:outline-none shadow-sm min-w-[220px]"
        >
          <option value="">Select a sector...</option>
          {(meta?.sectors ?? []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={selectedAngle}
          onChange={e => { setSelectedAngle(e.target.value); setActiveSequence(null) }}
          className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-secondary focus:border-yanne focus:outline-none shadow-sm"
        >
          <option value="">All Angles</option>
          {(meta?.angles ?? []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {selectedSector && (
          <span className="text-xs text-text-faint">{sequences.length} sequences</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Sequence list */}
        <div className="col-span-1 rounded-lg border border-border bg-surface-raised shadow-sm max-h-[600px] overflow-y-auto">
          {!selectedSector ? (
            <div className="p-8 text-center text-xs text-text-faint">Select a sector to browse sequences</div>
          ) : sequences.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-faint">No sequences found</div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {sequences.map(s => (
                <button
                  key={`${s.sector}-${s.angle}-${s.set_number}`}
                  onClick={() => viewSequence(s.sector, s.angle, s.set_number)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-raised transition-colors ${
                    activeSequence?.sector === s.sector && activeSequence?.angle === s.angle && activeSequence?.set_number === s.set_number
                      ? 'bg-yanne/5 border-l-2 border-yanne'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-text-primary">Set {s.set_number} — {s.skeleton}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${angleColor(s.angle)}`}>
                      {s.angle}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-faint truncate">{s.subject_lines[0]}</div>
                  <div className="text-[10px] text-text-faint mt-0.5">CTA: {s.cta_type}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sequence detail */}
        <div className="col-span-2 rounded-lg border border-border bg-surface-raised shadow-sm">
          {detailLoading ? (
            <div className="p-8"><Spinner /></div>
          ) : !activeSequence ? (
            <div className="p-12 text-center text-sm text-text-faint">Click a sequence to preview</div>
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-text-primary">{activeSequence.sector}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${angleColor(activeSequence.angle)}`}>
                      {activeSequence.angle}
                    </span>
                    <span className="text-xs text-text-faint">Set {activeSequence.set_number} / Skeleton {activeSequence.skeleton} / CTA: {activeSequence.cta_type}</span>
                  </div>
                </div>
              </div>

              {/* Subject lines */}
              <div className="mb-4">
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Subject Lines</div>
                <div className="space-y-1">
                  {activeSequence.subject_lines.map((sl, i) => (
                    <div key={i} className="rounded bg-surface-raised px-3 py-1.5 text-xs text-text-secondary font-mono">{sl}</div>
                  ))}
                </div>
              </div>

              {/* Emails */}
              {[
                { label: 'Email 1 (Initial)', body: activeSequence.email_1?.body_spintax },
                { label: 'Email 2 (Follow-up)', body: activeSequence.email_2?.body_spintax },
                { label: 'Email 3 (Break-up)', body: activeSequence.email_3?.body_spintax },
              ].map(email => (
                <div key={email.label} className="mb-4">
                  <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">{email.label}</div>
                  <pre className="rounded-lg bg-surface-raised p-4 text-xs text-text-secondary whitespace-pre-wrap font-sans leading-relaxed border border-border-muted max-h-[200px] overflow-y-auto">
                    {email.body || 'No content'}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
