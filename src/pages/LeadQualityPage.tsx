import { useAirtableInbox } from '../hooks/useAirtableInbox'
import { useBisonCampaigns } from '../hooks/useBisonCampaigns'
import { MetricCard } from '../components/MetricCard'
import { Spinner } from '../components/Spinner'

export function LeadQualityPage() {
  const { data: inbox, loading: loadingI, error: errorI } = useAirtableInbox()
  const { data: campaigns, loading: loadingC, error: errorC } = useBisonCampaigns()

  if (loadingI || loadingC) return <Spinner />

  const apiError = errorI || errorC
  if (apiError && apiError.includes('not configured')) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-bold text-text-primary">Lead Quality</h2>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-raised py-20">
          <p className="text-sm text-text-muted">API keys not configured</p>
          <p className="text-xs text-text-faint mt-1">Add EMAILBISON_API_KEY and AIRTABLE_API_KEY</p>
        </div>
      </div>
    )
  }

  const cats = inbox?.categoryCounts ?? {}
  const totalCategorized = Object.values(cats).reduce((s, v) => s + v, 0)
  const meetingsBooked = cats['Meeting Booked'] ?? 0
  const interested = cats['Interested'] ?? 0
  const wrongPerson = cats['Wrong Person'] ?? 0
  const doNotContact = cats['Do Not Contact'] ?? 0
  const tooEarly = cats['Too Early'] ?? 0
  const alreadyRaised = cats['Already Raised'] ?? 0

  const qualityScore = totalCategorized > 0
    ? Math.round(((meetingsBooked + interested) / totalCategorized) * 100)
    : 0

  // Sort categories by count for the breakdown
  const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1])

  const catColors: Record<string, string> = {
    'Interested': 'bg-emerald-500',
    'Meeting Booked': 'bg-blue-500',
    'Not Interested': 'bg-red-400',
    'Out of Office': 'bg-zinc-300',
    'Bounce': 'bg-orange-400',
    'Unsubscribe': 'bg-orange-300',
    'Referral': 'bg-violet-400',
    'Wrong Person': 'bg-amber-400',
    'Do Not Contact': 'bg-red-600',
    'Follow Up Later': 'bg-cyan-400',
    'Needs More Info': 'bg-sky-400',
    'Already Raised': 'bg-zinc-400',
    'Too Early': 'bg-yellow-400',
    'Auto-Reply': 'bg-zinc-300',
    'Other': 'bg-surface-overlay',
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-text-primary">Lead Quality</h2>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-5 gap-4">
        <MetricCard label="Quality Score" value={`${qualityScore}%`} subtitle="Interested + Booked / Total" />
        <MetricCard label="Total Categorized" value={totalCategorized} />
        <MetricCard label="Meetings Booked" value={meetingsBooked} />
        <MetricCard label="Wrong Person" value={wrongPerson + doNotContact} subtitle="Bad targeting" />
        <MetricCard label="Too Early / Already Raised" value={tooEarly + alreadyRaised} subtitle="Timing mismatch" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Full funnel breakdown */}
        <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Lead Category Distribution</h3>
          <div className="space-y-2">
            {sortedCats.map(([cat, count]) => {
              const pct = totalCategorized > 0 ? (count / totalCategorized) * 100 : 0
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-text-muted">{cat}</span>
                    <span className="font-semibold text-text-primary">{count} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                    <div
                      className={`h-full rounded-full ${catColors[cat] ?? 'bg-zinc-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Campaign quality comparison */}
        <div className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Campaign Health</h3>
          <p className="text-xs text-text-faint mb-3">Campaigns with highest bounce rates</p>
          <div className="space-y-2">
            {(campaigns?.campaigns ?? [])
              .filter(c => c.emails_sent > 100)
              .sort((a, b) => b.bounce_rate - a.bounce_rate)
              .slice(0, 8)
              .map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2">
                  <span className="text-xs text-text-secondary truncate max-w-[60%]">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${
                      (c.bounce_rate ?? 0) > 3 ? 'text-red-600' :
                      (c.bounce_rate ?? 0) > 1 ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {c.bounce_rate?.toFixed(1)}% bounce
                    </span>
                  </div>
                </div>
              ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border-muted">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Lowest Reply Campaigns</h4>
            <div className="space-y-2">
              {(campaigns?.campaigns ?? [])
                .filter(c => c.emails_sent > 200 && c.reply_rate < 1)
                .sort((a, b) => a.reply_rate - b.reply_rate)
                .slice(0, 5)
                .map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
                    <span className="text-xs text-text-secondary truncate max-w-[60%]">{c.name}</span>
                    <span className="text-xs font-bold text-red-600">{c.reply_rate?.toFixed(2)}%</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
