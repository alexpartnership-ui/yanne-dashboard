import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
      const { data: rows } = await supabase
        .from('call_logs')
        .select('rep, date, score_percentage, call_type')
        .order('scored_at', { ascending: false })
        .limit(200)

      if (!rows) { setLoading(false); return }

      const grouped: RepCallHistory = {}
      for (const row of rows) {
        const rep = row.rep as string
        if (!grouped[rep]) grouped[rep] = []
        if (grouped[rep].length < 30) {
          grouped[rep].push({
            date: row.date ?? '',
            score: row.score_percentage ?? 0,
            call_type: row.call_type ?? '',
          })
        }
      }

      // Reverse so oldest is first (for sparkline left-to-right)
      for (const rep of Object.keys(grouped)) {
        grouped[rep].reverse()
      }

      setData(grouped)
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading }
}
