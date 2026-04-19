import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from './useAuth'

export interface FunnelCounts {
  mq_reach: number
  first_call_reach: number
  second_call_reach: number
  third_call_reach: number
  won: number
  nda_ever: number
}

export interface FunnelDwellRow {
  stage_id: string
  stage_label: string
  sample_count: number
  median_ms: number | null
  mean_ms: number | null
  p75_ms: number | null
}

export interface FunnelOutcomes {
  still: number
  won: number
  lost: number
  ltl: number
  dq: number
}

export interface UseFunnelHealthArgs {
  cohortStart: string // 'YYYY-MM-DD'
  cohortEnd: string   // 'YYYY-MM-DD'
}

export function useFunnelHealth({ cohortStart, cohortEnd }: UseFunnelHealthArgs): {
  counts: FunnelCounts | null
  dwell: FunnelDwellRow[]
  outcomes: FunnelOutcomes | null
  lastSync: string | null
  loading: boolean
  syncing: boolean
  error: string | null
  refetch: () => void
  triggerSync: () => Promise<void>
} {
  const [counts, setCounts] = useState<FunnelCounts | null>(null)
  const [dwell, setDwell] = useState<FunnelDwellRow[]>([])
  const [outcomes, setOutcomes] = useState<FunnelOutcomes | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ cohort_start: cohortStart, cohort_end: cohortEnd })
      const [countsRes, dwellRes, outcomesRes, syncRes] = await Promise.all([
        apiFetch(`/api/funnel-health/counts?${params}`),
        apiFetch(`/api/funnel-health/dwell?${params}`),
        apiFetch(`/api/funnel-health/outcomes?${params}`),
        apiFetch('/api/funnel-health/last-sync'),
      ])

      if (!countsRes.ok) throw new Error(`Counts fetch failed: ${countsRes.status}`)
      if (!dwellRes.ok) throw new Error(`Dwell fetch failed: ${dwellRes.status}`)
      if (!outcomesRes.ok) throw new Error(`Outcomes fetch failed: ${outcomesRes.status}`)
      if (!syncRes.ok) throw new Error(`Last-sync fetch failed: ${syncRes.status}`)

      const [countsData, dwellData, outcomesData, syncData] = await Promise.all([
        countsRes.json(),
        dwellRes.json(),
        outcomesRes.json(),
        syncRes.json(),
      ])

      setCounts(countsData ?? null)
      setDwell(Array.isArray(dwellData) ? dwellData : [])
      setOutcomes(outcomesData ?? null)
      setLastSync(syncData?.last_sync ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel data')
    } finally {
      setLoading(false)
    }
  }, [cohortStart, cohortEnd])

  useEffect(() => {
    load()
  }, [load])

  const triggerSync = useCallback(async () => {
    setSyncing(true)
    const prevSync = lastSync
    try {
      const res = await apiFetch('/api/funnel-health/refresh', { method: 'POST' })
      if (!res.ok) {
        setError(`Sync failed: ${res.status}`)
        return
      }

      // Poll for last-sync change (up to 90s, every 5s)
      const maxAttempts = 18
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        try {
          const syncRes = await apiFetch('/api/funnel-health/last-sync')
          if (syncRes.ok) {
            const syncData = await syncRes.json()
            const newSync = syncData?.last_sync ?? null
            if (newSync && newSync !== prevSync) {
              await load()
              return
            }
          }
        } catch {
          // continue polling
        }
      }
      // Timed out — still refetch to get latest state
      await load()
    } finally {
      setSyncing(false)
    }
  }, [lastSync, load])

  return { counts, dwell, outcomes, lastSync, loading, syncing, error, refetch: load, triggerSync }
}
