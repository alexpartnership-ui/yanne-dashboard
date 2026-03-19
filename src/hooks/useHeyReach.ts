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

export interface HeyReachList {
  id: number
  name: string
  totalItemsCount: number
  listType: string
  creationTime: string
  campaignIds: number[]
}

export interface SenderAccount {
  id: number
  campaignCount: number
  campaignNames: string[]
  totalLeadsAssigned: number
}

interface HeyReachResult {
  campaigns: HeyReachCampaign[]
  lists: HeyReachList[]
  senders: SenderAccount[]
  totals: {
    totalCampaigns: number
    activeCampaigns: number
    pausedCampaigns: number
    draftCampaigns: number
    completedCampaigns: number
    totalLeads: number
    totalInProgress: number
    totalFinished: number
    totalFailed: number
    totalPending: number
    totalExcluded: number
    totalSenderAccounts: number
    totalLists: number
    totalListLeads: number
    completionRate: number
    failureRate: number
  }
}

export function useHeyReach() {
  const [data, setData] = useState<HeyReachResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [campaignsRes, listsRes] = await Promise.all([
          apiFetch('/api/heyreach/campaigns'),
          apiFetch('/api/heyreach/lists'),
        ])

        if (!campaignsRes.ok) {
          const err = await campaignsRes.json()
          setError(err.error || 'Failed to fetch HeyReach data')
          setLoading(false)
          return
        }

        const campaignsJson = await campaignsRes.json()
        const campaigns: HeyReachCampaign[] = campaignsJson?.items || []

        const listsJson = listsRes.ok ? await listsRes.json() : { items: [] }
        const lists: HeyReachList[] = listsJson?.items || []

        const active = campaigns.filter(c => c.status === 'IN_PROGRESS')
        const paused = campaigns.filter(c => c.status === 'PAUSED')
        const draft = campaigns.filter(c => c.status === 'DRAFT')
        const completed = campaigns.filter(c => c.status === 'COMPLETED' || c.status === 'FINISHED')

        let totalLeads = 0, totalInProgress = 0, totalFinished = 0, totalFailed = 0, totalPending = 0, totalExcluded = 0
        const senderMap = new Map<number, { campaignCount: number; campaignNames: string[]; totalLeadsAssigned: number }>()

        for (const c of campaigns) {
          if (c.progressStats) {
            totalLeads += c.progressStats.totalUsers
            totalInProgress += c.progressStats.totalUsersInProgress
            totalFinished += c.progressStats.totalUsersFinished
            totalFailed += c.progressStats.totalUsersFailed
            totalPending += c.progressStats.totalUsersPending
            totalExcluded += c.progressStats.totalUsersExcluded
          }
          const leadsPerSender = c.progressStats ? Math.round(c.progressStats.totalUsers / Math.max(c.campaignAccountIds.length, 1)) : 0
          for (const id of c.campaignAccountIds) {
            const existing = senderMap.get(id)
            if (existing) {
              existing.campaignCount++
              existing.campaignNames.push(c.name)
              existing.totalLeadsAssigned += leadsPerSender
            } else {
              senderMap.set(id, { campaignCount: 1, campaignNames: [c.name], totalLeadsAssigned: leadsPerSender })
            }
          }
        }

        const senders: SenderAccount[] = Array.from(senderMap.entries())
          .map(([id, s]) => ({ id, ...s }))
          .sort((a, b) => b.campaignCount - a.campaignCount)

        const totalListLeads = lists.reduce((sum, l) => sum + l.totalItemsCount, 0)
        const processed = totalFinished + totalFailed + totalExcluded
        const completionRate = totalLeads > 0 ? Math.round((totalFinished / totalLeads) * 1000) / 10 : 0
        const failureRate = processed > 0 ? Math.round((totalFailed / processed) * 1000) / 10 : 0

        setData({
          campaigns,
          lists,
          senders,
          totals: {
            totalCampaigns: campaigns.length,
            activeCampaigns: active.length,
            pausedCampaigns: paused.length,
            draftCampaigns: draft.length,
            completedCampaigns: completed.length,
            totalLeads,
            totalInProgress,
            totalFinished,
            totalFailed,
            totalPending,
            totalExcluded,
            totalSenderAccounts: senderMap.size,
            totalLists: lists.length,
            totalListLeads,
            completionRate,
            failureRate,
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
