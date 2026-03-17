import { useEffect, useState } from 'react'

interface InboxRecord {
  id: string
  fields: Record<string, unknown>
}

interface SetterStats {
  name: string
  total: number
  meetingsBooked: number
  interested: number
  unactioned: number
}

interface InboxResult {
  records: InboxRecord[]
  setterStats: SetterStats[]
  categoryCounts: Record<string, number>
  totalRecords: number
}

export function useAirtableInbox(formula?: string) {
  const [data, setData] = useState<InboxResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const params = new URLSearchParams()
        if (formula) params.set('formula', formula)
        params.set('sort', 'Reply Time')
        params.set('direction', 'desc')

        const res = await globalThis.fetch(`/api/airtable/inbox?${params}`)
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch inbox data')
          setLoading(false)
          return
        }
        const json = await res.json()
        const records: InboxRecord[] = json.records || []

        // Category counts
        const categoryCounts: Record<string, number> = {}
        const setterMap: Record<string, { total: number; meetings: number; interested: number; unactioned: number }> = {}

        for (const r of records) {
          const cat = r.fields['Lead Category'] as string || 'Uncategorized'
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1

          const setter = r.fields['Setter'] as string
          if (setter) {
            if (!setterMap[setter]) setterMap[setter] = { total: 0, meetings: 0, interested: 0, unactioned: 0 }
            setterMap[setter].total++
            if (cat === 'Meeting Booked') setterMap[setter].meetings++
            if (cat === 'Interested') setterMap[setter].interested++
            if (r.fields['Open Response'] === true) setterMap[setter].unactioned++
          }
        }

        const setterStats = Object.entries(setterMap)
          .map(([name, s]) => ({ name, total: s.total, meetingsBooked: s.meetings, interested: s.interested, unactioned: s.unactioned }))
          .sort((a, b) => b.meetingsBooked - a.meetingsBooked)

        setData({ records, setterStats, categoryCounts, totalRecords: records.length })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [formula])

  return { data, loading, error }
}
