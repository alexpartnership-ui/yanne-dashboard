import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CallLog } from '../types/database'

export function useCallDetail(id: string | undefined) {
  const [data, setData] = useState<CallLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function fetch() {
      setLoading(true)
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', id)
        .single()
      if (error) setError(error.message)
      else setData(data as CallLog)
      setLoading(false)
    }
    fetch()
  }, [id])

  return { data, loading, error }
}
