import { useEffect, useState } from 'react'
import type { DealWithCalls } from '../types/database'
import { apiFetch } from './useAuth'

export function useDeals() {
  const [data, setData] = useState<DealWithCalls[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      try {
        const res = await apiFetch('/api/deals')
        if (!res.ok) throw new Error('Failed to fetch deals')
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
