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

export interface FunnelCycleRow {
  segment_id: string
  segment_label: string
  sample_count: number
  median_days: number | null
  mean_days: number | null
  p75_days: number | null
}

export interface FunnelCloserRow {
  owner_id: string
  closer_name: string
  mq_reach: number
  first_call_reach: number
  second_call_reach: number
  third_call_reach: number
  won: number
  nda_ever: number
}

export interface FunnelMonthlyCohort {
  cohort_month: string  // 'YYYY-MM-DD'
  mq_count: number
  won_count: number
  won_pct: number
  is_immature: boolean
}

export interface FunnelThirdCallDeal {
  hubspot_deal_id: string
  dealname: string | null
  current_stage_id: string
  current_stage_label: string | null
  owner_id: string | null
  closer_name: string
  amount: number | null
  date_entered_third: string | null
  dwell_days: number | null
  last_activity_at: string | null
}

export type ThirdCallOutcome = 'all' | 'still' | 'won' | 'lost' | 'ltl' | 'dq'

export interface FunnelDwellByOutcomeRow {
  outcome: string
  outcome_label: string
  sample_count: number
  median_days: number | null
  mean_days: number | null
  p75_days: number | null
}

export interface FunnelRetainerScoreboard {
  mtd_retainer: number
  qtd_retainer: number
  ytd_retainer: number
  prev_mtd_retainer: number
  prev_qtd_retainer: number
  prev_ytd_retainer: number
}

export interface FunnelRetainerByStage {
  mq_retainer: number
  first_call_retainer: number
  second_call_retainer: number
  third_call_retainer: number
  won_retainer: number
  nda_ever_retainer: number
}

export interface AtRiskDeal {
  hubspot_deal_id: string
  dealname: string | null
  owner_id: string | null
  closer_name: string
  amount: number | null
  date_entered_third: string | null
  dwell_days: number | null
  last_activity_at: string | null
  days_over_threshold: number | null
  risk_score: number | null
}

export interface CallScoreOutcomeRow {
  call_slot: number
  score_bucket: string
  sample_count: number
  signed_count: number
  lost_count: number
  won_pct: number
  avg_score: number | null
}

export interface WalkingDeadDeal {
  hubspot_deal_id: string
  dealname: string | null
  owner_id: string | null
  closer_name: string
  current_stage_id: string
  current_stage_label: string | null
  amount: number | null
  last_activity_at: string | null
  days_since_activity: number | null
}

export interface UseFunnelHealthArgs {
  cohortStart: string // 'YYYY-MM-DD'
  cohortEnd: string   // 'YYYY-MM-DD'
}

export function useFunnelHealth({ cohortStart, cohortEnd }: UseFunnelHealthArgs): {
  counts: FunnelCounts | null
  dwell: FunnelDwellRow[]
  outcomes: FunnelOutcomes | null
  cycles: FunnelCycleRow[]
  byCloser: FunnelCloserRow[]
  monthlyCohorts: FunnelMonthlyCohort[]
  dwellByOutcome: FunnelDwellByOutcomeRow[]
  retainerScoreboard: FunnelRetainerScoreboard | null
  retainerByStage: FunnelRetainerByStage | null
  atRisk: AtRiskDeal[]
  walkingDead: WalkingDeadDeal[]
  callScoreOutcome: CallScoreOutcomeRow[]
  lastSync: string | null
  loading: boolean
  syncing: boolean
  error: string | null
  refetch: () => void
  triggerSync: () => Promise<void>
  loadThirdCallDeals: (outcome: ThirdCallOutcome) => Promise<FunnelThirdCallDeal[]>
} {
  const [counts, setCounts] = useState<FunnelCounts | null>(null)
  const [dwell, setDwell] = useState<FunnelDwellRow[]>([])
  const [outcomes, setOutcomes] = useState<FunnelOutcomes | null>(null)
  const [cycles, setCycles] = useState<FunnelCycleRow[]>([])
  const [byCloser, setByCloser] = useState<FunnelCloserRow[]>([])
  const [monthlyCohorts, setMonthlyCohorts] = useState<FunnelMonthlyCohort[]>([])
  const [dwellByOutcome, setDwellByOutcome] = useState<FunnelDwellByOutcomeRow[]>([])
  const [retainerScoreboard, setRetainerScoreboard] = useState<FunnelRetainerScoreboard | null>(null)
  const [retainerByStage, setRetainerByStage] = useState<FunnelRetainerByStage | null>(null)
  const [atRisk, setAtRisk] = useState<AtRiskDeal[]>([])
  const [walkingDead, setWalkingDead] = useState<WalkingDeadDeal[]>([])
  const [callScoreOutcome, setCallScoreOutcome] = useState<CallScoreOutcomeRow[]>([])
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

      const [countsRes, dwellRes, outcomesRes, cyclesRes, closerRes, monthlyRes, dwellByOutRes, scoreRes, retStageRes, atRiskRes, deadRes, corrRes, syncRes] = await Promise.all([
        apiFetch(`/api/funnel-health/counts?${params}`, { signal }),
        apiFetch(`/api/funnel-health/dwell?${params}`, { signal }),
        apiFetch(`/api/funnel-health/outcomes?${params}`, { signal }),
        apiFetch(`/api/funnel-health/cycles?${params}`, { signal }),
        apiFetch(`/api/funnel-health/by-closer?${params}`, { signal }),
        apiFetch(`/api/funnel-health/monthly-cohorts?months_back=12`, { signal }),
        apiFetch(`/api/funnel-health/dwell-by-outcome?${params}`, { signal }),
        apiFetch(`/api/funnel-health/retainer-scoreboard`, { signal }),
        apiFetch(`/api/funnel-health/retainer-by-stage?${params}`, { signal }),
        apiFetch(`/api/funnel-health/at-risk?threshold_days=15`, { signal }),
        apiFetch(`/api/funnel-health/walking-dead?stale_days=30`, { signal }),
        apiFetch(`/api/funnel-health/callscore-outcome`, { signal }),
        apiFetch('/api/funnel-health/last-sync', { signal }),
      ])

      if (signal.aborted) return

      if (!countsRes.ok) throw new Error(`Counts fetch failed: ${countsRes.status}`)
      if (!dwellRes.ok) throw new Error(`Dwell fetch failed: ${dwellRes.status}`)
      if (!outcomesRes.ok) throw new Error(`Outcomes fetch failed: ${outcomesRes.status}`)
      if (!cyclesRes.ok) throw new Error(`Cycles fetch failed: ${cyclesRes.status}`)
      if (!closerRes.ok) throw new Error(`By-closer fetch failed: ${closerRes.status}`)
      if (!monthlyRes.ok) throw new Error(`Monthly-cohorts fetch failed: ${monthlyRes.status}`)
      if (!dwellByOutRes.ok) throw new Error(`Dwell-by-outcome fetch failed: ${dwellByOutRes.status}`)
      if (!scoreRes.ok) throw new Error(`Retainer scoreboard fetch failed: ${scoreRes.status}`)
      if (!retStageRes.ok) throw new Error(`Retainer-by-stage fetch failed: ${retStageRes.status}`)
      if (!atRiskRes.ok) throw new Error(`At-risk fetch failed: ${atRiskRes.status}`)
      if (!deadRes.ok) throw new Error(`Walking-dead fetch failed: ${deadRes.status}`)
      if (!corrRes.ok) throw new Error(`Callscore-outcome fetch failed: ${corrRes.status}`)
      if (!syncRes.ok) throw new Error(`Last-sync fetch failed: ${syncRes.status}`)

      const [countsData, dwellData, outcomesData, cyclesData, closerData, monthlyData, dwellByOutData, scoreData, retStageData, atRiskData, deadData, corrData, syncData] = await Promise.all([
        countsRes.json(), dwellRes.json(), outcomesRes.json(), cyclesRes.json(),
        closerRes.json(), monthlyRes.json(), dwellByOutRes.json(),
        scoreRes.json(), retStageRes.json(), atRiskRes.json(), deadRes.json(),
        corrRes.json(), syncRes.json(),
      ])

      if (signal.aborted) return

      setCounts(countsData ?? null)
      setDwell(Array.isArray(dwellData) ? dwellData : [])
      setOutcomes(outcomesData ?? null)
      setCycles(Array.isArray(cyclesData) ? cyclesData : [])
      setByCloser(Array.isArray(closerData) ? closerData : [])
      setMonthlyCohorts(Array.isArray(monthlyData) ? monthlyData : [])
      setDwellByOutcome(Array.isArray(dwellByOutData) ? dwellByOutData : [])
      setRetainerScoreboard(scoreData ?? null)
      setRetainerByStage(retStageData ?? null)
      setAtRisk(Array.isArray(atRiskData) ? atRiskData : [])
      setWalkingDead(Array.isArray(deadData) ? deadData : [])
      setCallScoreOutcome(Array.isArray(corrData) ? corrData : [])
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

  const loadThirdCallDeals = useCallback(async (outcome: ThirdCallOutcome): Promise<FunnelThirdCallDeal[]> => {
    const params = new URLSearchParams({ cohort_start: cohortStart, cohort_end: cohortEnd, outcome })
    const res = await apiFetch(`/api/funnel-health/third-call-deals?${params}`)
    if (!res.ok) throw new Error(`Third-call deals fetch failed: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, [cohortStart, cohortEnd])

  return { counts, dwell, outcomes, cycles, byCloser, monthlyCohorts, dwellByOutcome, retainerScoreboard, retainerByStage, atRisk, walkingDead, callScoreOutcome, lastSync, loading, syncing, error, refetch, triggerSync, loadThirdCallDeals }
}
