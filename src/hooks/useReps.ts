import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RepPerformance } from '../types/database'

export function useReps() {
  const [data, setData] = useState<RepPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const { data, error } = await supabase
        .from('rep_performance')
        .select('*')
        .order('rep')
      if (error) setError(error.message)
      else setData(data as RepPerformance[])
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
