import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

interface CEOStats {
  callsThisWeek: number
  avgScore: number
  bestRep: { name: string; avg: number } | null
  activeDeals: number
  closeRate: number
  alerts: { type: string; message: string }[]
}

export function useCEOStats() {
  const [data, setData] = useState<CEOStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch('/api/ceo-stats')
        if (!res.ok) throw new Error('Failed to fetch CEO stats')
        setData(await res.json())
      } catch (err) {
        console.error('CEO stats error:', err)
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading }
}
