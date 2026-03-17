import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

interface DailyReport {
  date: string
  count: number
}

export interface SlackMeetingsData {
  todaySoFar: number
  thisWeek: number
  avgPerDay: number
  dailyReports: DailyReport[]
  byHost: Record<string, number>
}

export function useSlackMeetings(days = 14) {
  const [data, setData] = useState<SlackMeetingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch(`/api/slack/meetings-booked?days=${days}`)
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch meetings data')
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
