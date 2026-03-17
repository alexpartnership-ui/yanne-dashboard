import { useEffect, useState } from 'react'

export interface HubSpotDeal {
  id: string
  name: string
  stage: string
  stageName: string
  amount: number | null
  closeDate: string | null
  createDate: string | null
}

const STAGE_NAMES: Record<string, string> = {
  appointmentscheduled: 'Meeting Qualified',
  qualifiedtobuy: 'NDA',
  presentationscheduled: '1st Closing Call',
  decisionmakerboughtin: '2nd Closing Call',
  '1066193534': '3rd Call / Contract',
  closedwon: 'Closed Won',
  closedlost: 'Closed Lost',
  contractsent: 'Long Term Lead',
  '1066871403': 'Disqualified',
}

interface HubSpotResult {
  deals: HubSpotDeal[]
  stageBreakdown: Record<string, number>
  totalValue: number
  wonCount: number
  lostCount: number
  activeCount: number
}

export function useHubSpotDeals() {
  const [data, setData] = useState<HubSpotResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await globalThis.fetch('/api/hubspot/deals')
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
          stageName: STAGE_NAMES[r.properties.dealstage || ''] || r.properties.dealstage || '',
          amount: r.properties.amount ? parseFloat(r.properties.amount) : null,
          closeDate: r.properties.closedate || null,
          createDate: r.properties.createdate || null,
        }))

        const stageBreakdown: Record<string, number> = {}
        let totalValue = 0, wonCount = 0, lostCount = 0, activeCount = 0

        for (const d of deals) {
          const sName = d.stageName || 'Unknown'
          stageBreakdown[sName] = (stageBreakdown[sName] || 0) + 1
          if (d.amount) totalValue += d.amount
          if (d.stage === 'closedwon') wonCount++
          else if (d.stage === 'closedlost' || d.stage === '1066871403') lostCount++
          else activeCount++
        }

        setData({ deals, stageBreakdown, totalValue, wonCount, lostCount, activeCount })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
