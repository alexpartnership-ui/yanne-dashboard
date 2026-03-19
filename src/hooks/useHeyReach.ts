import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

export interface HeyReachProgressStats {
  totalUsers: number
  totalUsersInProgress: number
  totalUsersPending: number
  totalUsersFinished: number
  totalUsersFailed: number
  totalUsersManuallyStopped: number
  totalUsersExcluded: number
}

export interface HeyReachCampaign {
  id: number
  name: string
  creationTime: string
  linkedInUserListName: string | null
  linkedInUserListId: number
  campaignAccountIds: number[]
  status: string
  progressStats: HeyReachProgressStats | null
  startedAt: string | null
}

interface HeyReachResult {
  campaigns: HeyReachCampaign[]
  totals: {
    totalCampaigns: number
    activeCampaigns: number
    totalLeads: number
    totalInProgress: number
    totalFinished: number
    totalFailed: number
    totalPending: number
    totalExcluded: number
    totalSenderAccounts: number
  }
}

export function useHeyReach() {
  const [data, setData] = useState<HeyReachResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await apiFetch('/api/heyreach/campaigns')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch HeyReach data')
          setLoading(false)
          return
        }
        const json = await res.json()
        const items: HeyReachCampaign[] = json?.items || []

        const active = items.filter(c => c.status === 'IN_PROGRESS')
        let totalLeads = 0, totalInProgress = 0, totalFinished = 0, totalFailed = 0, totalPending = 0, totalExcluded = 0
        let totalSenderAccounts = new Set<number>()

        for (const c of items) {
          if (c.progressStats) {
            totalLeads += c.progressStats.totalUsers
            totalInProgress += c.progressStats.totalUsersInProgress
            totalFinished += c.progressStats.totalUsersFinished
            totalFailed += c.progressStats.totalUsersFailed
            totalPending += c.progressStats.totalUsersPending
            totalExcluded += c.progressStats.totalUsersExcluded
          }
          for (const id of c.campaignAccountIds) {
            totalSenderAccounts.add(id)
          }
        }

        setData({
          campaigns: items,
          totals: {
            totalCampaigns: items.length,
            activeCampaigns: active.length,
            totalLeads,
            totalInProgress,
            totalFinished,
            totalFailed,
            totalPending,
            totalExcluded,
            totalSenderAccounts: totalSenderAccounts.size,
          },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetchAll()
  }, [])

  return { data, loading, error }
}
