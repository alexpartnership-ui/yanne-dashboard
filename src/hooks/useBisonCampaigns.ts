import { useEffect, useState } from 'react'

export interface BisonCampaign {
  id: number
  name: string
  status: string
  created_at: string
  emails_sent: number
  replied: number
  unique_replies: number
  bounced: number
  interested: number
  total_leads: number
  total_leads_contacted: number
  unique_opens: number
  unsubscribed: number
  completion_percentage: number
  // Computed
  reply_rate: number
  bounce_rate: number
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
    avgReplyRate: number
    avgBounceRate: number
  }
}

export function useBisonCampaigns() {
  const [data, setData] = useState<BisonCampaignsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await globalThis.fetch('/api/bison/campaigns')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch campaigns')
          setLoading(false)
          return
        }
        const json = await res.json()
        const raw = Array.isArray(json) ? json : json.data || json.campaigns || []

        // Map flat Bison fields + compute rates
        const campaigns: BisonCampaign[] = raw.map((c: Record<string, unknown>) => {
          const sent = Number(c.emails_sent) || 0
          const replied = Number(c.replied) || Number(c.unique_replies) || 0
          const bounced = Number(c.bounced) || 0
          const interested = Number(c.interested) || 0
          return {
            id: c.id as number,
            name: (c.name as string) || '',
            status: (c.status as string) || '',
            created_at: (c.created_at as string) || '',
            emails_sent: sent,
            replied,
            unique_replies: Number(c.unique_replies) || 0,
            bounced,
            interested,
            total_leads: Number(c.total_leads) || 0,
            total_leads_contacted: Number(c.total_leads_contacted) || 0,
            unique_opens: Number(c.unique_opens) || 0,
            unsubscribed: Number(c.unsubscribed) || 0,
            completion_percentage: Number(c.completion_percentage) || 0,
            reply_rate: sent > 0 ? (replied / sent) * 100 : 0,
            bounce_rate: sent > 0 ? (bounced / sent) * 100 : 0,
          }
        })

        const active = campaigns.filter(c => c.status === 'active' || c.status === 'launching')
        let totalSent = 0, totalReplies = 0, totalInterested = 0, totalBounced = 0
        let replyRateSum = 0, bounceRateSum = 0, rateCount = 0

        for (const c of campaigns) {
          totalSent += c.emails_sent
          totalReplies += c.replied
          totalInterested += c.interested
          totalBounced += c.bounced
          if (c.emails_sent > 0) {
            replyRateSum += c.reply_rate
            bounceRateSum += c.bounce_rate
            rateCount++
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
            avgReplyRate: rateCount > 0 ? Math.round((replyRateSum / rateCount) * 100) / 100 : 0,
            avgBounceRate: rateCount > 0 ? Math.round((bounceRateSum / rateCount) * 100) / 100 : 0,
          },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetchAll()
  }, [])

  return { data, loading, error }
}
