import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Grade, RepName } from '../types/database'

interface DashboardRow {
  rep: RepName
  date: string | null
  score_percentage: number
  grade: Grade | null
  coaching_priority: string | null
}

interface DashboardStats {
  totalCalls: number
  avgScore: number
  activeDeals: number
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number }
  callsPerDay: { date: string; rep: string; count: number }[]
  coachingThemes: { theme: string; count: number }[]
  repQuickStats: { rep: string; calls: number; avg: number }[]
}

export function useDashboardStats() {
  const [data, setData] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const floor = thirtyDaysAgo.toISOString()

      const [callsRes, dealsRes] = await Promise.all([
        supabase
          .from('call_logs')
          .select('rep, date, score_percentage, grade, coaching_priority')
          .gte('scored_at', floor)
          .order('scored_at', { ascending: false }),
        supabase
          .from('deals_with_calls')
          .select('deal_id, deal_status')
          .eq('deal_status', 'active'),
      ])

      const calls = (callsRes.data ?? []) as DashboardRow[]
      const activeDeals = (dealsRes.data ?? []).length

      // Grade distribution
      const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
      for (const c of calls) {
        if (!c.grade) continue
        const letter = c.grade.charAt(0) as keyof typeof gradeDistribution
        if (letter in gradeDistribution) gradeDistribution[letter]++
      }

      // Avg score
      const avgScore = calls.length ? Math.round(calls.reduce((s, c) => s + c.score_percentage, 0) / calls.length) : 0

      // Calls per day (last 14d)
      const fourteenDaysAgo = new Date()
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const recentCalls = calls.filter(c => c.date && new Date(c.date) >= fourteenDaysAgo)
      const dayRepMap: Record<string, Record<string, number>> = {}
      for (const c of recentCalls) {
        if (!c.date) continue
        const d = c.date.slice(0, 10)
        if (!dayRepMap[d]) dayRepMap[d] = {}
        dayRepMap[d][c.rep] = (dayRepMap[d][c.rep] || 0) + 1
      }
      const callsPerDay: { date: string; rep: string; count: number }[] = []
      for (const [date, reps] of Object.entries(dayRepMap)) {
        for (const [rep, count] of Object.entries(reps)) {
          callsPerDay.push({ date, rep, count })
        }
      }
      callsPerDay.sort((a, b) => a.date.localeCompare(b.date))

      // Top coaching themes (7d)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const weekCalls = calls.filter(c => c.date && new Date(c.date) >= sevenDaysAgo)
      const themeFreq: Record<string, number> = {}
      for (const c of weekCalls) {
        if (c.coaching_priority) {
          const key = c.coaching_priority.slice(0, 80)
          themeFreq[key] = (themeFreq[key] || 0) + 1
        }
      }
      const coachingThemes = Object.entries(themeFreq)
        .map(([theme, count]) => ({ theme, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      // Rep quick stats
      const repMap: Record<string, { calls: number; totalScore: number }> = {}
      for (const c of calls) {
        if (!repMap[c.rep]) repMap[c.rep] = { calls: 0, totalScore: 0 }
        repMap[c.rep].calls++
        repMap[c.rep].totalScore += c.score_percentage
      }
      const repQuickStats = Object.entries(repMap)
        .map(([rep, s]) => ({ rep, calls: s.calls, avg: Math.round(s.totalScore / s.calls) }))
        .sort((a, b) => b.avg - a.avg)

      setData({
        totalCalls: calls.length,
        avgScore,
        activeDeals,
        gradeDistribution,
        callsPerDay,
        coachingThemes,
        repQuickStats,
      })
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading }
}
