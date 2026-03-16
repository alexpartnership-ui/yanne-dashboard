import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CallLog, RepName, CallType, Grade } from '../types/database'

export interface CallFilters {
  rep?: RepName
  call_type?: CallType
  grade?: Grade
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
        .limit(100)

      if (filters.rep) query = query.eq('rep', filters.rep)
      if (filters.call_type) query = query.eq('call_type', filters.call_type)
      if (filters.grade) query = query.eq('grade', filters.grade)

      const { data, error } = await query
      if (error) setError(error.message)
      else setData(data as CallLog[])
      setLoading(false)
    }
    fetch()
  }, [filters.rep, filters.call_type, filters.grade])

  return { data, loading, error }
}
