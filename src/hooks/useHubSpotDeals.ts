import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

export interface HubSpotDeal {
  id: string
  name: string
  stage: string
  stageName: string
  pipeline: string
  amount: number | null
  closeDate: string | null
  createDate: string | null
  lastModified: string | null
  lastActivity: string | null
  dealScore: number | null
  probability: number | null
  forecastAmount: number | null
}

interface HubSpotResult {
  deals: HubSpotDeal[]
  totalCount: number
}

export function useHubSpotDeals() {
  const [data, setData] = useState<HubSpotResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch('/api/hubspot/deals')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch HubSpot deals')
          setLoading(false)
          return
        }
        const json = await res.json()
        const results = json.results || []

        const deals: HubSpotDeal[] = results.map((r: { id: string; properties: Record<string, string | null> }) => ({
          id: r.id,
          name: r.properties.dealname || '',
          stage: r.properties.dealstage || '',
          stageName: r.properties.stageName || r.properties.dealstage || '',
          pipeline: r.properties.pipeline || 'default',
          amount: r.properties.amount ? parseFloat(r.properties.amount) : null,
          closeDate: r.properties.closedate || null,
          createDate: r.properties.createdate || null,
          lastModified: r.properties.hs_lastmodifieddate || null,
          lastActivity: r.properties.hs_lastactivity_date || r.properties.notes_last_updated || r.properties.hs_lastmodifieddate || null,
          dealScore: r.properties.hs_deal_score ? parseFloat(r.properties.hs_deal_score) : null,
          probability: r.properties.hs_deal_stage_probability ? parseFloat(r.properties.hs_deal_stage_probability) : null,
          forecastAmount: r.properties.hs_forecast_amount ? parseFloat(r.properties.hs_forecast_amount) : null,
        }))

        setData({ deals, totalCount: deals.length })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
