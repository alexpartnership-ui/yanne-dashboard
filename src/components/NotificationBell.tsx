import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../hooks/useAuth'

interface Notification {
  id: string
  level: 'critical' | 'warning' | 'win'
  message: string
  link?: string
  time: string
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await apiFetch('/api/ceo-stats')
        if (!res.ok) return
        const data = await res.json()
        const alerts = (data.alerts || []).map((a: { type: string; message: string }, i: number) => ({
          id: `alert-${i}-${a.message.slice(0, 20)}`,
          level: a.type === 'danger' ? 'critical' : a.type,
          message: a.message,
          time: new Date().toLocaleTimeString(),
        }))
        setNotifications(alerts)
      } catch { /* silent */ }
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const active = notifications.filter(n => !dismissed.has(n.id))
  const unread = active.length

  const colors = { critical: 'text-red-600', warning: 'text-amber-600', win: 'text-emerald-600' }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-1.5 text-zinc-400 hover:text-zinc-600"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg z-50">
          <div className="border-b border-zinc-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-zinc-700">Notifications</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {active.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-400">No new notifications</div>
            ) : (
              active.map(n => (
                <div key={n.id} className="flex items-start gap-3 border-b border-zinc-50 px-4 py-3 last:border-0">
                  <span className={`mt-0.5 text-lg ${colors[n.level]}`}>
                    {n.level === 'critical' ? '!' : n.level === 'warning' ? '!' : '!'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-700">{n.message}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">{n.time}</p>
                  </div>
                  <button
                    onClick={() => setDismissed(prev => new Set(prev).add(n.id))}
                    className="text-zinc-300 hover:text-zinc-500"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
