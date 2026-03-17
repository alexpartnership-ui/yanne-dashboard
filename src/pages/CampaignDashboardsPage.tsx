import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBisonCampaigns } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

interface BisonWorkspace {
  id: number
  name: string
}

function statusBadge(status: string): string {
  if (status === 'active' || status === 'launching') return 'bg-emerald-100 text-emerald-700'
  if (status === 'completed') return 'bg-zinc-100 text-zinc-600'
  if (status === 'paused') return 'bg-amber-100 text-amber-700'
  if (status === 'stopped') return 'bg-red-100 text-red-700'
  return 'bg-zinc-100 text-zinc-500'
}

export function CampaignDashboardsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedClient = searchParams.get('client')
  const [workspaces, setWorkspaces] = useState<BisonWorkspace[]>([])
  const [loadingWs, setLoadingWs] = useState(true)
  const { data: campaigns, loading: loadingC } = useBisonCampaigns()

  useEffect(() => {
    fetch('/api/bison/workspaces')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const ws = Array.isArray(data) ? data : data.data || data.workspaces || []
        setWorkspaces(ws.filter((w: BisonWorkspace) => w.name && w.name.toLowerCase().includes('project')))
      })
      .finally(() => setLoadingWs(false))
  }, [])

  if (loadingWs || loadingC) return <Spinner />

  const allCampaigns = campaigns?.campaigns ?? []
  const t = campaigns?.totals

  // If a client is selected, show that client's dashboard
  if (selectedClient) {
    // Filter campaigns by client name (search in campaign name)
    const clientName = selectedClient.replace(/^Project\s*[-–]?\s*/i, '').trim().toLowerCase()
    const clientCampaigns = allCampaigns.filter(c => c.name.toLowerCase().includes(clientName))
    const active = clientCampaigns.filter(c => c.status === 'active' || c.status === 'launching')
    const totalSent = clientCampaigns.reduce((s, c) => s + (c.emails_sent || 0), 0)
    const totalReplies = clientCampaigns.reduce((s, c) => s + (c.replied || 0), 0)
    const totalInterested = clientCampaigns.reduce((s, c) => s + (c.interested || 0), 0)

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSearchParams({})} className="text-xs text-yanne hover:underline">{'\u2190'} All Clients</button>
          <h2 className="text-2xl font-bold text-zinc-900">{selectedClient.replace(/^Project\s*[-–]?\s*/i, '')}</h2>
        </div>

        <div className="mb-6 grid grid-cols-5 gap-4">
          <MetricCard label="Campaigns" value={clientCampaigns.length} subtitle={`${active.length} active`} />
          <MetricCard label="Emails Sent" value={totalSent.toLocaleString()} />
          <MetricCard label="Replies" value={totalReplies} />
          <MetricCard label="Interested" value={totalInterested} />
          <MetricCard label="Reply Rate" value={totalSent > 0 ? `${((totalReplies / totalSent) * 100).toFixed(2)}%` : '0%'} />
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <th className="text-left px-4 py-2">Campaign</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Sent</th>
                <th className="text-right px-4 py-2">Replies</th>
                <th className="text-right px-4 py-2">Reply Rate</th>
                <th className="text-right px-4 py-2">Interested</th>
                <th className="text-right px-4 py-2">Bounced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {clientCampaigns.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 text-sm text-zinc-800 max-w-[250px] truncate">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(c.status)}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600 text-right">{c.emails_sent?.toLocaleString() ?? 0}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-600 text-right">{c.replied ?? 0}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-right">
                      <span className={c.reply_rate > 3 ? 'text-emerald-600' : c.reply_rate > 1 ? 'text-amber-600' : 'text-red-600'}>
                        {c.reply_rate?.toFixed(2) ?? 0}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-emerald-600 text-right">{c.interested ?? 0}</td>
                    <td className="px-4 py-2.5 text-xs text-right">
                      <span className={c.bounce_rate > 3 ? 'text-red-600' : 'text-zinc-400'}>{c.bounce_rate?.toFixed(1) ?? 0}%</span>
                    </td>
                  </tr>
              ))}
              {clientCampaigns.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-400">No campaigns found for this client</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Default: show all client workspaces as clickable cards
  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-zinc-900">Campaign Dashboards</h2>
      <p className="mb-6 text-xs text-zinc-400">Click a client to view their campaign performance</p>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard label="Total Campaigns" value={t?.totalCampaigns ?? 0} />
        <MetricCard label="Active" value={t?.activeCampaigns ?? 0} />
        <MetricCard label="Emails Sent" value={(t?.totalSent ?? 0).toLocaleString()} />
        <MetricCard label="Avg Reply Rate" value={`${t?.avgReplyRate ?? 0}%`} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {workspaces.map(ws => {
          const clientName = ws.name.replace(/^Project\s*[-–]?\s*/i, '').trim()
          return (
            <button
              key={ws.id}
              onClick={() => setSearchParams({ client: ws.name })}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-yanne-light transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-bold text-zinc-900">{clientName}</h3>
              </div>
              <p className="text-[10px] text-zinc-400">Workspace #{ws.id}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
