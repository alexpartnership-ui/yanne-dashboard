import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

export interface DailyEmailReport {
  date: string
  emailsSent: number
  peopleContacted: number
  replies: number
  replyRate: number
  bounced: number
  bounceRate: number
  unsubscribed: number
  interested: number
  interestedPct: number
  activeMailboxes: number
}

export interface EmailReportTotals {
  emailsSent: number
  peopleContacted: number
  replies: number
  bounced: number
  unsubscribed: number
  interested: number
  replyRate: number
  bounceRate: number
  interestedPct: number
  days: number
}

export interface SlackEmailReportsData {
  dailyReports: DailyEmailReport[]
  totals: EmailReportTotals
}

export function useSlackEmailReports(days = 30) {
  const [data, setData] = useState<SlackEmailReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch(`/api/slack/email-reports?days=${days}`)
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch email reports')
          setLoading(false)
          return
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [days])

  return { data, loading, error }
}
