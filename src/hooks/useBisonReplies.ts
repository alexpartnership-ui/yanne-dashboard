import { useEffect, useState } from 'react'

interface BisonReply {
  id: number
  lead_email: string
  lead_name: string
  campaign_name: string
  subject: string
  body_preview: string
  status: string
  read: boolean
  created_at: string
}

interface RepliesResult {
  replies: BisonReply[]
  totals: {
    total: number
    interested: number
    notInterested: number
    autoReply: number
    unread: number
  }
}

export function useBisonReplies() {
  const [data, setData] = useState<RepliesResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await globalThis.fetch('/api/bison/replies?per_page=100')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch replies')
          setLoading(false)
          return
        }
        const json = await res.json()
        const replies: BisonReply[] = json.data || json.replies || json || []

        const interested = replies.filter(r => r.status === 'interested').length
        const notInterested = replies.filter(r => r.status === 'not_interested').length
        const autoReply = replies.filter(r => r.status === 'automated_reply' || r.status === 'auto_reply').length
        const unread = replies.filter(r => !r.read).length

        setData({
          replies,
          totals: { total: replies.length, interested, notInterested, autoReply, unread },
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}
