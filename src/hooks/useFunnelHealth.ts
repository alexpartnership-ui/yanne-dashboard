import { useEffect, useState, useCallback, useRef } from 'react'
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

  // Fix 2: unmount safety ref for triggerSync polling
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ cohort_start: cohortStart, cohort_end: cohortEnd })

      const [countsRes, dwellRes, outcomesRes, syncRes] = await Promise.all([
        apiFetch(`/api/funnel-health/counts?${params}`, { signal }),
        apiFetch(`/api/funnel-health/dwell?${params}`, { signal }),
        apiFetch(`/api/funnel-health/outcomes?${params}`, { signal }),
        apiFetch('/api/funnel-health/last-sync', { signal }),
      ])

      if (signal.aborted) return

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

      if (signal.aborted) return

      setCounts(countsData ?? null)
      setDwell(Array.isArray(dwellData) ? dwellData : [])
      setOutcomes(outcomesData ?? null)
      setLastSync(syncData?.last_sync ?? null)
    } catch (err) {
      if (signal.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load funnel data')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [cohortStart, cohortEnd])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const triggerSync = useCallback(async () => {
    if (!mountedRef.current) return
    setSyncing(true)
    const prevSync = lastSync
    try {
      const res = await apiFetch('/api/funnel-health/refresh', { method: 'POST' })
      if (!res.ok) {
        if (mountedRef.current) setError(`Sync failed: ${res.status}`)
        return
      }

      // Poll for last-sync change (up to 90s, every 5s)
      const maxAttempts = 18
      for (let i = 0; i < maxAttempts; i++) {
        if (!mountedRef.current) return
        await new Promise(resolve => setTimeout(resolve, 5000))
        if (!mountedRef.current) return
        try {
          const syncRes = await apiFetch('/api/funnel-health/last-sync')
          if (syncRes.ok) {
            const syncData = await syncRes.json()
            const newSync = syncData?.last_sync ?? null
            if (newSync && newSync !== prevSync) {
              if (!mountedRef.current) return
              await load(new AbortController().signal)
              return
            }
          }
        } catch {
          // continue polling
        }
      }
      // Timed out — still refetch to get latest state
      if (mountedRef.current) await load(new AbortController().signal)
    } finally {
      if (mountedRef.current) setSyncing(false)
    }
  }, [lastSync, load])

  const refetch = useCallback(() => {
    const c = new AbortController()
    load(c.signal)
  }, [load])

  return { counts, dwell, outcomes, lastSync, loading, syncing, error, refetch, triggerSync }
}
