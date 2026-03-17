import { useEffect, useState } from 'react'
import type { CallLog, RepName, CallType, Grade } from '../types/database'
import { apiFetch } from './useAuth'

export type DateRange = 'today' | '7d' | '30d' | 'all'

export interface CallFilters {
  rep?: RepName
  call_type?: CallType
  grade?: Grade
  dateRange?: DateRange
}

function dateFloor(range: DateRange): string | null {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'today') {
    now.setHours(0, 0, 0, 0)
  } else if (range === '7d') {
    now.setDate(now.getDate() - 7)
  } else if (range === '30d') {
    now.setDate(now.getDate() - 30)
  }
  return now.toISOString()
}

export function useCallLogs(filters: CallFilters = {}) {
  const [data, setData] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (filters.rep) params.set('rep', filters.rep)
        if (filters.call_type) params.set('call_type', filters.call_type)
        if (filters.grade) params.set('grade', filters.grade)
        const floor = dateFloor(filters.dateRange ?? 'all')
        if (floor) params.set('scored_after', floor)

        const res = await apiFetch(`/api/calls?${params}`)
        if (!res.ok) throw new Error('Failed to fetch calls')
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [filters.rep, filters.call_type, filters.grade, filters.dateRange])

  return { data, loading, error }
}
