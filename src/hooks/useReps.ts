import { useEffect, useState } from 'react'
import type { RepPerformance } from '../types/database'
import { apiFetch } from './useAuth'

export function useReps() {
  const [data, setData] = useState<RepPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      try {
        const res = await apiFetch('/api/reps')
        if (!res.ok) throw new Error('Failed to fetch reps')
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
