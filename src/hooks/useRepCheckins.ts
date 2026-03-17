import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

interface Checkin {
  rep: string
  date: string
  scheduled: number
  completed: number
  progressed: number
}

interface DateSummary {
  date: string
  totalScheduled: number
  totalCompleted: number
  reps: Record<string, number>
}

interface RepSummary {
  totalScheduled: number
  totalCompleted: number
  totalProgressed: number
  days: number
}

export interface RepCheckinsData {
  checkins: Checkin[]
  byDate: DateSummary[]
  byRep: Record<string, RepSummary>
}

export function useRepCheckins(days = 14) {
  const [data, setData] = useState<RepCheckinsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch(`/api/rep-checkins?days=${days}`)
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch check-ins')
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
