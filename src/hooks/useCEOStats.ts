import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface CEOStats {
  callsThisWeek: number
  avgScore: number
  bestRep: { name: string; avg: number } | null
  activeDeals: number
  closeRate: number
  alerts: { type: string; message: string }[]
}

export function useCEOStats() {
  const [data, setData] = useState<CEOStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const floor = sevenDaysAgo.toISOString()

      const [callsRes, dealsRes, repsRes] = await Promise.all([
        supabase
          .from('call_logs')
          .select('rep, score_percentage, pipeline_inflation')
          .gte('scored_at', floor),
        supabase
          .from('deals_with_calls')
          .select('deal_id, deal_status, updated_at, pipeline_inflation, rep_name'),
        supabase
          .from('rep_performance')
          .select('rep, call_1_rolling_avg, call_1_trend, call_2_rolling_avg, call_2_trend, call_3_rolling_avg, call_3_trend'),
      ])

      const calls = callsRes.data ?? []
      const deals = dealsRes.data ?? []
      const reps = repsRes.data ?? []

      // Calls this week
      const callsThisWeek = calls.length

      // Avg score
      const avgScore = calls.length
        ? Math.round(calls.reduce((s, c) => s + (c.score_percentage as number), 0) / calls.length)
        : 0

      // Best rep (by avg score this week)
      const repScores: Record<string, { total: number; count: number }> = {}
      for (const c of calls) {
        const rep = c.rep as string
        if (!repScores[rep]) repScores[rep] = { total: 0, count: 0 }
        repScores[rep].total += c.score_percentage as number
        repScores[rep].count++
      }
      let bestRep: { name: string; avg: number } | null = null
      for (const [name, s] of Object.entries(repScores)) {
        const avg = Math.round(s.total / s.count)
        if (!bestRep || avg > bestRep.avg) bestRep = { name, avg }
      }

      // Active deals & close rate
      const activeDeals = deals.filter(d => d.deal_status === 'active').length
      const signedDeals = deals.filter(d => d.deal_status === 'signed').length
      const totalDeals = deals.length
      const closeRate = totalDeals > 0 ? Math.round((signedDeals / totalDeals) * 100) : 0

      // Alerts
      const alerts: { type: string; message: string }[] = []

      // Pipeline inflation deals
      const inflatedDeals = deals.filter(d => d.pipeline_inflation && d.deal_status === 'active')
      if (inflatedDeals.length > 0) {
        alerts.push({
          type: 'warning',
          message: `${inflatedDeals.length} active deal${inflatedDeals.length > 1 ? 's' : ''} flagged for pipeline inflation`,
        })
      }

      // Stalled deals (14d+)
      const now = Date.now()
      const stalledDeals = deals.filter(d => {
        if (d.deal_status !== 'active' || !d.updated_at) return false
        const days = Math.floor((now - new Date(d.updated_at as string).getTime()) / 86400000)
        return days >= 14
      })
      if (stalledDeals.length > 0) {
        alerts.push({
          type: 'danger',
          message: `${stalledDeals.length} deal${stalledDeals.length > 1 ? 's' : ''} stalled 14+ days`,
        })
      }

      // Declining rep trends
      for (const rep of reps) {
        const declining = [rep.call_1_trend, rep.call_2_trend, rep.call_3_trend].filter(t => t === 'Declining')
        if (declining.length >= 2) {
          alerts.push({
            type: 'warning',
            message: `${rep.rep} declining in ${declining.length} call types`,
          })
        }
      }

      setData({ callsThisWeek, avgScore, bestRep, activeDeals, closeRate, alerts })
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading }
}
