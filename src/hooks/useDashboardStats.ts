import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

interface DashboardStats {
  totalCalls: number
  avgScore: number
  activeDeals: number
  pipelineValue: number
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
      try {
        const res = await apiFetch('/api/dashboard-stats')
        if (!res.ok) throw new Error('Failed to fetch stats')
        setData(await res.json())
      } catch (err) {
        console.error('Dashboard stats error:', err)
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading }
}
