import { useEffect, useState } from 'react'

interface Meeting {
  id: string
  title: string
  attendeeNames: string
  attendeeEmails: string
  hostName: string
  hostEmail: string
  startTime: string | null
  bookingTime: string | null
}

interface MeetingsResult {
  meetings: Meeting[]
  thisWeek: number
  thisMonth: number
  byHost: Record<string, number>
}

export function useAirtableMeetings() {
  const [data, setData] = useState<MeetingsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await globalThis.fetch('/api/airtable/meetings')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch meetings')
          setLoading(false)
          return
        }
        const json = await res.json()
        const records = json.records || []

        const meetings: Meeting[] = records.map((r: { id: string; fields: Record<string, unknown> }) => ({
          id: r.id,
          title: r.fields['Meeting Title'] as string || '',
          attendeeNames: r.fields['Attendee Names'] as string || '',
          attendeeEmails: r.fields['Attendee Emails'] as string || '',
          hostName: r.fields['Host Name'] as string || '',
          hostEmail: r.fields['Host Email'] as string || '',
          startTime: r.fields['Start Time ISO'] as string || null,
          bookingTime: r.fields['Booking Time'] as string || null,
        }))

        const now = new Date()
        const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
        const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30)

        const thisWeek = meetings.filter(m => m.startTime && new Date(m.startTime) >= weekAgo).length
        const thisMonth = meetings.filter(m => m.startTime && new Date(m.startTime) >= monthAgo).length

        const byHost: Record<string, number> = {}
        for (const m of meetings) {
          if (m.hostName) byHost[m.hostName] = (byHost[m.hostName] || 0) + 1
        }

        setData({ meetings, thisWeek, thisMonth, byHost })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
