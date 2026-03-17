import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

export interface CallPoint {
  date: string
  score: number
  call_type: string
}

export type RepCallHistory = Record<string, CallPoint[]>

export function useRepCallHistory() {
  const [data, setData] = useState<RepCallHistory>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch('/api/rep-call-history')
        if (!res.ok) throw new Error('Failed to fetch call history')
        setData(await res.json())
      } catch (err) {
        console.error('Rep call history error:', err)
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading }
}
