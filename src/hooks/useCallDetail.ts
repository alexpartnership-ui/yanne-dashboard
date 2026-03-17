import { useEffect, useState } from 'react'
import type { CallLog } from '../types/database'
import { apiFetch } from './useAuth'

export function useCallDetail(id: string | undefined) {
  const [data, setData] = useState<CallLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function fetch() {
      setLoading(true)
      try {
        const res = await apiFetch(`/api/calls/${id}`)
        if (!res.ok) throw new Error('Failed to fetch call')
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [id])

  return { data, loading, error }
}
