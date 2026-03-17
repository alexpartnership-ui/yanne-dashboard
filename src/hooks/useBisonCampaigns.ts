import { useEffect, useState } from 'react'

interface BisonCampaign {
  id: number
  name: string
  status: string
  created_at: string
  statistics?: {
    total_leads: number
    leads_contacted: number
    emails_sent: number
    emails_opened: number
    unique_opens: number
    replies: number
    interested: number
    bounced: number
    unsubscribed: number
    open_rate: number
    reply_rate: number
    bounce_rate: number
    interested_rate: number
  }
}

interface BisonCampaignsResult {
  campaigns: BisonCampaign[]
  totals: {
    totalCampaigns: number
    activeCampaigns: number
    totalSent: number
    totalReplies: number
    totalInterested: number
    totalBounced: number
    avgOpenRate: number
    avgReplyRate: number
    avgBounceRate: number
  }
}

export function useBisonCampaigns() {
  const [data, setData] = useState<BisonCampaignsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await globalThis.fetch('/api/bison/campaigns')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch campaigns')
          setLoading(false)
          return
        }
        const json = await res.json()
        const campaigns: BisonCampaign[] = json.data || json.campaigns || json || []

        const active = campaigns.filter(c => c.status === 'active' || c.status === 'launching')
        let totalSent = 0, totalReplies = 0, totalInterested = 0, totalBounced = 0
        let openRateSum = 0, replyRateSum = 0, bounceRateSum = 0, rateCount = 0

        for (const c of campaigns) {
          const s = c.statistics
          if (s) {
            totalSent += s.emails_sent || 0
            totalReplies += s.replies || 0
            totalInterested += s.interested || 0
            totalBounced += s.bounced || 0
            if (s.emails_sent > 0) {
              openRateSum += s.open_rate || 0
              replyRateSum += s.reply_rate || 0
              bounceRateSum += s.bounce_rate || 0
              rateCount++
            }
          }
        }

        setData({
          campaigns,
          totals: {
            totalCampaigns: campaigns.length,
            activeCampaigns: active.length,
            totalSent,
            totalReplies,
            totalInterested,
            totalBounced,
            avgOpenRate: rateCount > 0 ? Math.round((openRateSum / rateCount) * 100) / 100 : 0,
            avgReplyRate: rateCount > 0 ? Math.round((replyRateSum / rateCount) * 100) / 100 : 0,
            avgBounceRate: rateCount > 0 ? Math.round((bounceRateSum / rateCount) * 100) / 100 : 0,
          },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
