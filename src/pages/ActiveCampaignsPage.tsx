import { useState, useEffect } from 'react'
import { useBisonCampaigns, type BisonCampaign } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

interface SequenceStep {
  id: number
  email_subject: string
  email_body: string
  order: number | string
  wait_in_days: number | string
  variant: boolean
  variant_from_step_id: number | null
  thread_reply: boolean
}

function rateColor(rate: number): string {
  if (rate >= 2) return 'text-emerald-600'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}

function SequenceViewer({ campaignId }: { campaignId: number }) {
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/bison/campaigns/${campaignId}/sequence`)
      .then(r => r.ok ? r.json() : { sequence_steps: [] })
      .then(d => setSteps(d.sequence_steps || d.data?.sequence_steps || []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false))
  }, [campaignId])

  if (loading) return <div className="p-3 text-xs text-zinc-400">Loading sequence...</div>
  if (steps.length === 0) return <div className="p-3 text-xs text-zinc-400">No sequence data</div>

  // Group by order (variants share same order)
  const mainSteps = steps.filter(s => !s.variant).sort((a, b) => Number(a.order) - Number(b.order))
  const variantMap: Record<number, SequenceStep[]> = {}
  for (const s of steps.filter(s => s.variant)) {
    const parentId = s.variant_from_step_id ?? 0
    if (!variantMap[parentId]) variantMap[parentId] = []
    variantMap[parentId].push(s)
  }

  return (
    <div className="space-y-2">
      {mainSteps.map((step, i) => {
        const variants = variantMap[step.id] || []
        const isExpanded = expandedStep === step.id
        return (
          <div key={step.id} className="rounded-lg border border-zinc-100 bg-white overflow-hidden">
            <button
              onClick={() => setExpandedStep(isExpanded ? null : step.id)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-yanne text-white text-[10px] font-bold shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-800">{step.email_subject}</div>
                  <div className="text-[10px] text-zinc-400">
                    {step.thread_reply ? 'Thread reply' : 'New thread'}
                    {Number(step.wait_in_days) > 0 && ` \u2022 Wait ${step.wait_in_days}d`}
                    {variants.length > 0 && ` \u2022 ${variants.length} variant${variants.length > 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
              <svg className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-zinc-100">
                {/* Main step body */}
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Email Body</div>
                  <pre className="rounded bg-zinc-50 p-3 text-xs text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto border border-zinc-100">
                    {step.email_body || 'No body'}
                  </pre>
                </div>

                {/* Variants */}
                {variants.map((v, vi) => (
                  <div key={v.id} className="mt-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-3">
                    <div className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-1">Variant {vi + 1}: {v.email_subject}</div>
                    <pre className="rounded bg-white p-3 text-xs text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[150px] overflow-y-auto border border-violet-100">
                      {v.email_body || 'No body'}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ActiveCampaignsPage() {
  const { data, loading, error } = useBisonCampaigns()
  const [selectedCampaign, setSelectedCampaign] = useState<BisonCampaign | null>(null)
  const [search, setSearch] = useState('')

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">{error}</p>

  const activeCampaigns = (data?.campaigns ?? [])
    .filter(c => c.status === 'active' || c.status === 'launching')
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.emails_sent - a.emails_sent)

  const totalSent = activeCampaigns.reduce((s, c) => s + c.emails_sent, 0)
  const totalReplied = activeCampaigns.reduce((s, c) => s + c.replied, 0)
  const totalInterested = activeCampaigns.reduce((s, c) => s + c.interested, 0)
  const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold text-zinc-900">Active Campaigns</h2>

      <div className="mb-4 flex items-center gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search active campaigns..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-yanne focus:outline-none w-64" />
        <span className="text-xs text-zinc-400">{activeCampaigns.length} active campaigns</span>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-3">
        <MetricCard label="Active Campaigns" value={activeCampaigns.length} />
        <MetricCard label="Emails Sent" value={totalSent.toLocaleString()} />
        <MetricCard label="Replies" value={totalReplied.toLocaleString()} />
        <MetricCard label="Reply Rate" value={`${replyRate.toFixed(2)}%`} />
        <MetricCard label="Interested" value={totalInterested.toLocaleString()} />
      </div>

      <div className="flex gap-4">
        {/* Campaign list */}
        <div className="w-1/3 space-y-2 max-h-[700px] overflow-y-auto">
          {activeCampaigns.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCampaign(c)}
              className={`w-full text-left rounded-lg border p-4 transition-all hover:shadow-md ${
                selectedCampaign?.id === c.id ? 'border-yanne bg-yanne/5 shadow-md' : 'border-zinc-200 bg-white shadow-sm'
              }`}
            >
              <div className="text-sm font-medium text-zinc-800 mb-1 leading-tight">{c.name}</div>
              <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                <span>{c.emails_sent.toLocaleString()} sent</span>
                <span className={rateColor(c.reply_rate)}>{c.reply_rate.toFixed(2)}% reply</span>
                <span className="text-emerald-600">{c.interested} interested</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-zinc-100 overflow-hidden">
                <div className="h-full rounded-full bg-yanne transition-all" style={{ width: `${c.completion_percentage}%` }} />
              </div>
              <div className="text-[9px] text-zinc-300 mt-0.5">{c.completion_percentage}% complete</div>
            </button>
          ))}
        </div>

        {/* Campaign detail + sequence */}
        <div className="flex-1">
          {!selectedCampaign ? (
            <div className="rounded-lg border-2 border-dashed border-zinc-200 bg-white py-20 text-center text-sm text-zinc-400">
              Select a campaign to view details and sequence
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold text-zinc-900 mb-4">{selectedCampaign.name}</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Emails Sent</div>
                    <div className="text-xl font-bold text-zinc-900">{selectedCampaign.emails_sent.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Replies</div>
                    <div className="text-xl font-bold text-zinc-900">{selectedCampaign.replied}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Reply Rate</div>
                    <div className={`text-xl font-bold ${rateColor(selectedCampaign.reply_rate)}`}>{selectedCampaign.reply_rate.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Interested</div>
                    <div className="text-xl font-bold text-emerald-600">{selectedCampaign.interested}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Bounced</div>
                    <div className={`text-xl font-bold ${selectedCampaign.bounce_rate > 3 ? 'text-red-600' : 'text-zinc-900'}`}>{selectedCampaign.bounced} ({selectedCampaign.bounce_rate.toFixed(2)}%)</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Total Leads</div>
                    <div className="text-xl font-bold text-zinc-900">{selectedCampaign.total_leads.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Contacted</div>
                    <div className="text-xl font-bold text-zinc-900">{selectedCampaign.total_leads_contacted.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500 uppercase">Completion</div>
                    <div className="text-xl font-bold text-zinc-900">{selectedCampaign.completion_percentage}%</div>
                  </div>
                </div>
              </div>

              {/* Sequence */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-zinc-700 mb-3">Email Sequence</h4>
                <SequenceViewer campaignId={selectedCampaign.id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
