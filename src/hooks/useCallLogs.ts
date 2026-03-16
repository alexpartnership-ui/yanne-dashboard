import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CallLog, RepName, CallType, Grade } from '../types/database'

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
      let query = supabase
        .from('call_logs')
        .select('*')
        .order('scored_at', { ascending: false })
        .limit(200)

      if (filters.rep) query = query.eq('rep', filters.rep)
      if (filters.call_type) query = query.eq('call_type', filters.call_type)
      if (filters.grade) query = query.eq('grade', filters.grade)

      const floor = dateFloor(filters.dateRange ?? 'all')
      if (floor) query = query.gte('scored_at', floor)

      const { data, error } = await query
      if (error) setError(error.message)
      else setData(data as CallLog[])
      setLoading(false)
    }
    fetch()
  }, [filters.rep, filters.call_type, filters.grade, filters.dateRange])

  return { data, loading, error }
}
