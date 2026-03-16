import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DealWithCalls } from '../types/database'

export function useDeals() {
  const [data, setData] = useState<DealWithCalls[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const { data, error } = await supabase
        .from('deals_with_calls')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) setError(error.message)
      else setData(data as DealWithCalls[])
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
