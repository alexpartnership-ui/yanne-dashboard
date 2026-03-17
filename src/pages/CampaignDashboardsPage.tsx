import { useEffect, useState } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

interface Client {
  id: string
  name: string
  hasKey: boolean
  apiKey: string
  addedAt?: string
}

interface Campaign {
  id: number
  name: string
  status: string
  emails_sent: number
  replied: number
  unique_replies: number
  bounced: number
  interested: number
  total_leads: number
  total_leads_contacted: number
  completion_percentage: number
}

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

function statusBadge(status: string): string {
  if (status === 'active' || status === 'launching') return 'bg-emerald-100 text-emerald-700'
  if (status === 'completed') return 'bg-zinc-100 text-zinc-600'
  if (status === 'paused') return 'bg-amber-100 text-amber-700'
  if (status === 'stopped') return 'bg-red-100 text-red-700'
  return 'bg-zinc-100 text-zinc-500'
}

function rateColor(rate: number): string {
  if (rate >= 2) return 'text-emerald-600'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}

// ─── Add Client Modal ───────────────────────────────────

function AddClientModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function save() {
    if (!name) return
    setSaving(true)
    await apiFetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, apiKey }),
    })
    setSaving(false)
    setName('')
    setApiKey('')
    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[500px] p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Add Client Workspace</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Client Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CTO Craft"
              className="w-full mt-0.5 rounded border border-zinc-200 px-3 py-2 text-sm focus:border-yanne focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">EmailBison Workspace API Key</label>
            <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste the workspace API key..."
              className="w-full mt-0.5 rounded border border-zinc-200 px-3 py-2 text-sm font-mono focus:border-yanne focus:outline-none" />
            <p className="text-[10px] text-zinc-400 mt-1">Go to send.yannecapital.com {'\u2192'} switch workspace {'\u2192'} Settings {'\u2192'} API Keys</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
          <button onClick={save} disabled={saving || !name} className="rounded-lg bg-yanne px-4 py-2 text-xs font-medium text-white hover:bg-yanne/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sequence Viewer ────────────────────────────────────

function SequenceViewer({ clientId, campaignId }: { clientId: string; campaignId: number }) {
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    apiFetch(`/api/clients/${clientId}/campaigns/${campaignId}/sequence`)
      .then(r => r.ok ? r.json() : { sequence_steps: [] })
      .then(d => setSteps(d.sequence_steps || []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false))
  }, [clientId, campaignId])

  if (loading) return <div className="p-3 text-xs text-zinc-400">Loading sequence...</div>
  if (steps.length === 0) return <div className="p-3 text-xs text-zinc-400">No sequence</div>

  const mainSteps = steps.filter(s => !s.variant).sort((a, b) => Number(a.order) - Number(b.order))
  const variantMap: Record<number, SequenceStep[]> = {}
  for (const s of steps.filter(s => s.variant)) {
    const pid = s.variant_from_step_id ?? 0
    if (!variantMap[pid]) variantMap[pid] = []
    variantMap[pid].push(s)
  }

  return (
    <div className="space-y-1.5">
      {mainSteps.map((step, i) => {
        const variants = variantMap[step.id] || []
        const isOpen = expanded === step.id
        return (
          <div key={step.id} className="rounded border border-zinc-100 bg-white">
            <button onClick={() => setExpanded(isOpen ? null : step.id)}
              className="flex w-full items-center justify-between px-3 py-2 hover:bg-zinc-50 text-left">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-yanne text-white text-[9px] font-bold shrink-0">{i + 1}</div>
                <div>
                  <div className="text-xs text-zinc-800">{step.email_subject}</div>
                  <div className="text-[9px] text-zinc-400">{step.thread_reply ? 'Reply' : 'New'} {Number(step.wait_in_days) > 0 && `\u2022 ${step.wait_in_days}d wait`} {variants.length > 0 && `\u2022 ${variants.length} variant${variants.length > 1 ? 's' : ''}`}</div>
                </div>
              </div>
              <svg className={`w-3 h-3 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 border-t border-zinc-100">
                <pre className="mt-2 rounded bg-zinc-50 p-3 text-xs text-zinc-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto">{step.email_body || 'No body'}</pre>
                {variants.map((v, vi) => (
                  <div key={v.id} className="mt-2 rounded border border-dashed border-violet-200 bg-violet-50/50 p-2">
                    <div className="text-[9px] font-semibold text-violet-600 mb-1">Variant {vi + 1}: {v.email_subject}</div>
                    <pre className="rounded bg-white p-2 text-xs text-zinc-700 whitespace-pre-wrap font-sans max-h-[120px] overflow-y-auto">{v.email_body || 'No body'}</pre>
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

// ─── Client Campaign Detail ─────────────────────────────

function ClientDetail({ client, onBack }: { client: Client; onBack: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiFetch(`/api/clients/${client.id}/campaigns`)
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error) }))
      .then(data => setCampaigns(Array.isArray(data) ? data : data.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [client.id])

  if (loading) return <Spinner />
  if (error) return <div className="text-sm text-red-600">{error}</div>

  const filtered = search ? campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : campaigns
  const active = filtered.filter(c => c.status === 'active' || c.status === 'launching')
  const totalSent = filtered.reduce((s, c) => s + (c.emails_sent || 0), 0)
  const totalReplied = filtered.reduce((s, c) => s + (c.replied || 0), 0)
  const totalInterested = filtered.reduce((s, c) => s + (c.interested || 0), 0)
  const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0
  const selected = campaigns.find(c => c.id === selectedId)

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-xs text-yanne hover:underline">{'\u2190'} All Clients</button>
        <h2 className="text-2xl font-bold text-zinc-900">{client.name}</h2>
      </div>

      <div className="mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..."
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-sm focus:border-yanne focus:outline-none w-64" />
      </div>

      <div className="mb-5 grid grid-cols-5 gap-3">
        <MetricCard label="Campaigns" value={filtered.length} subtitle={`${active.length} active`} />
        <MetricCard label="Emails Sent" value={totalSent.toLocaleString()} />
        <MetricCard label="Replies" value={totalReplied.toLocaleString()} />
        <MetricCard label="Reply Rate" value={`${replyRate.toFixed(2)}%`} />
        <MetricCard label="Interested" value={totalInterested.toLocaleString()} />
      </div>

      <div className="flex gap-4">
        {/* Campaign list */}
        <div className="w-2/5 space-y-2 max-h-[600px] overflow-y-auto">
          {filtered.map(c => {
            const rr = c.emails_sent > 0 ? (c.replied / c.emails_sent) * 100 : 0
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-md ${selectedId === c.id ? 'border-yanne bg-yanne/5' : 'border-zinc-200 bg-white'}`}>
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-800 leading-tight max-w-[80%]">{c.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${statusBadge(c.status)}`}>{c.status}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span>{c.emails_sent.toLocaleString()} sent</span>
                  <span className={rateColor(rr)}>{rr.toFixed(2)}%</span>
                  <span className="text-emerald-600">{c.interested} int</span>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="text-xs text-zinc-400 text-center py-8">No campaigns</p>}
        </div>

        {/* Detail + sequence */}
        <div className="flex-1">
          {!selected ? (
            <div className="rounded-lg border-2 border-dashed border-zinc-200 bg-white py-16 text-center text-sm text-zinc-400">
              Select a campaign to view details + sequence
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-zinc-900 mb-3">{selected.name}</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div><div className="text-[10px] text-zinc-500 uppercase">Sent</div><div className="text-lg font-bold">{selected.emails_sent.toLocaleString()}</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Replies</div><div className="text-lg font-bold">{selected.replied}</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Reply Rate</div><div className={`text-lg font-bold ${rateColor(selected.emails_sent > 0 ? (selected.replied / selected.emails_sent) * 100 : 0)}`}>{selected.emails_sent > 0 ? ((selected.replied / selected.emails_sent) * 100).toFixed(2) : 0}%</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Interested</div><div className="text-lg font-bold text-emerald-600">{selected.interested}</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Bounced</div><div className="text-lg font-bold">{selected.bounced}</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Leads</div><div className="text-lg font-bold">{selected.total_leads.toLocaleString()}</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Contacted</div><div className="text-lg font-bold">{selected.total_leads_contacted.toLocaleString()}</div></div>
                  <div><div className="text-[10px] text-zinc-500 uppercase">Completion</div><div className="text-lg font-bold">{selected.completion_percentage}%</div></div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
                <h4 className="text-sm font-semibold text-zinc-700 mb-3">Email Sequence</h4>
                <SequenceViewer clientId={client.id} campaignId={selected.id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export function CampaignDashboardsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  function loadClients() {
    apiFetch('/api/clients').then(r => r.json()).then(setClients).finally(() => setLoading(false))
  }

  useEffect(() => { loadClients() }, [])

  if (loading) return <Spinner />

  if (selectedClient) {
    return <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} />
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Campaign Dashboards</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Click a client to view their campaigns + sequences</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="rounded-lg bg-yanne px-4 py-2 text-xs font-medium text-white hover:bg-yanne/90 transition-colors">
          + Add Client
        </button>
      </div>

      <AddClientModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={loadClients} />

      {clients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20 text-center">
          <p className="text-sm text-zinc-500 mb-2">No clients configured</p>
          <p className="text-xs text-zinc-400 mb-4">Add a client with their EmailBison workspace API key</p>
          <button onClick={() => setShowAdd(true)}
            className="rounded-lg bg-yanne px-4 py-2 text-xs font-medium text-white hover:bg-yanne/90">
            + Add Client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {clients.map(c => (
            <button key={c.id} onClick={() => c.hasKey ? setSelectedClient(c) : setShowAdd(true)}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-yanne-light transition-all text-left">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${c.hasKey ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                  <h3 className="text-sm font-bold text-zinc-900">{c.name}</h3>
                </div>
                {!c.hasKey && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">No API key</span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400">{c.hasKey ? 'Click to view campaigns' : 'Add API key to connect'}</p>
              {c.addedAt && <p className="text-[9px] text-zinc-300 mt-1">Added {new Date(c.addedAt).toLocaleDateString()}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
