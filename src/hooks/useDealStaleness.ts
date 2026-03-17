import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DealWithCalls } from '../types/database'

export type StalenessLevel = 'none' | 'warning' | 'danger'

export interface DealStaleness {
  days: number
  level: StalenessLevel
}

function computeStaleness(deal: DealWithCalls): DealStaleness {
  const updated = deal.updated_at ? new Date(deal.updated_at) : null
  if (!updated || isNaN(updated.getTime())) return { days: 0, level: 'none' }
  const days = Math.floor((Date.now() - updated.getTime()) / 86400000)
  const level: StalenessLevel = days >= 14 ? 'danger' : days >= 7 ? 'warning' : 'none'
  return { days, level }
}

export function useDealStaleness(deals: DealWithCalls[]) {
  const [stalenessMap, setStalenessMap] = useState<Map<string, DealStaleness>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Compute from deal updated_at — no extra Supabase call needed
    const map = new Map<string, DealStaleness>()
    for (const deal of deals) {
      map.set(deal.deal_id, computeStaleness(deal))
    }
    setStalenessMap(map)
    setLoading(false)
  }, [deals])

  // Also check if we can get more precise dates from call_logs
  useEffect(() => {
    if (deals.length === 0) return
    const callIds = deals.flatMap(d => [d.call_1_record_id, d.call_2_record_id, d.call_3_record_id, d.call_4_record_id].filter(Boolean))
    if (callIds.length === 0) return

    supabase
      .from('call_logs')
      .select('id, date')
      .in('id', callIds as string[])
      .then(({ data: rows }) => {
        if (!rows || rows.length === 0) return
        const callDates = new Map<string, string>()
        for (const row of rows) {
          if (row.date) callDates.set(row.id as string, row.date as string)
        }

        const map = new Map<string, DealStaleness>()
        for (const deal of deals) {
          // Find most recent call date for this deal
          const ids = [deal.call_4_record_id, deal.call_3_record_id, deal.call_2_record_id, deal.call_1_record_id]
          let latestDate: Date | null = null
          for (const id of ids) {
            if (!id) continue
            const dateStr = callDates.get(id)
            if (dateStr) {
              const d = new Date(dateStr)
              if (!latestDate || d > latestDate) latestDate = d
            }
          }
          if (latestDate) {
            const days = Math.floor((Date.now() - latestDate.getTime()) / 86400000)
            const level: StalenessLevel = days >= 14 ? 'danger' : days >= 7 ? 'warning' : 'none'
            map.set(deal.deal_id, { days, level })
          } else {
            map.set(deal.deal_id, computeStaleness(deal))
          }
        }
        setStalenessMap(map)
      })
  }, [deals])

  return { stalenessMap, loading }
}
