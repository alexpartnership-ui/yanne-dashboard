import { useState, useMemo } from 'react'
import { GradeBadge, scoreBadgeColor } from './GradeBadge'
import { repDotClass } from '../lib/repColors'
import type { CallLog } from '../types/database'

type ColumnKey = 'date' | 'rep' | 'prospect' | 'type' | 'score' | 'grade' | 'coaching'

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'rep', label: 'Rep' },
  { key: 'prospect', label: 'Prospect' },
  { key: 'type', label: 'Type' },
  { key: 'score', label: 'Score' },
  { key: 'grade', label: 'Grade' },
  { key: 'coaching', label: 'Coaching Priority' },
]

const DEFAULT_VISIBLE: ColumnKey[] = ['date', 'rep', 'prospect', 'type', 'score', 'grade']

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)

  const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  if (target.getTime() === today.getTime()) return `Today \u2014 ${dayName}`
  if (target.getTime() === yesterday.getTime()) return `Yesterday \u2014 ${dayName}`
  return dayName
}

interface GroupedCallTableProps {
  data: CallLog[]
  onRowClick: (call: CallLog) => void
}

export function GroupedCallTable({ data, onRowClick }: GroupedCallTableProps) {
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE))
  const [showColPicker, setShowColPicker] = useState(false)
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const groups: Record<string, CallLog[]> = {}
    for (const call of data) {
      const dateKey = call.date ? call.date.slice(0, 10) : 'unknown'
      if (!groups[dateKey]) groups[dateKey] = []
      groups[dateKey].push(call)
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [data])

  // Auto-expand today and yesterday
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  function isExpanded(dateKey: string): boolean {
    if (collapsedDates.has(dateKey)) return false
    if (dateKey === today || dateKey === yesterday) return true
    return !collapsedDates.has(dateKey) && dateKey >= yesterday
  }

  function toggleDate(dateKey: string) {
    setCollapsedDates(prev => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  function toggleCol(key: ColumnKey) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const cols = ALL_COLUMNS.filter(c => visibleCols.has(c.key))

  return (
    <div>
      {/* Column toggle */}
      <div className="mb-3 flex justify-end relative">
        <button
          onClick={() => setShowColPicker(!showColPicker)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 shadow-sm"
        >
          Columns
          <svg className="w-3 h-3 ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {showColPicker && (
          <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg min-w-[160px]">
            {ALL_COLUMNS.map(c => (
              <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 rounded cursor-pointer">
                <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} className="rounded" />
                {c.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        {grouped.map(([dateKey, calls]) => {
          const expanded = isExpanded(dateKey)
          return (
            <div key={dateKey}>
              {/* Date header */}
              <button
                onClick={() => toggleDate(dateKey)}
                className="flex w-full items-center gap-2 bg-zinc-50 px-4 py-2.5 text-left hover:bg-zinc-100 transition-colors"
              >
                <svg className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <span className="text-xs font-semibold text-zinc-700">
                  {dateKey === 'unknown' ? 'No date' : formatDateHeader(dateKey)}
                </span>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
                  {calls.length} call{calls.length !== 1 ? 's' : ''}
                </span>
              </button>

              {expanded && (
                <table className="min-w-full divide-y divide-zinc-100">
                  <thead>
                    <tr>
                      {cols.map(c => (
                        <th key={c.key} className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {calls.map((call, i) => (
                      <tr
                        key={call.id}
                        onClick={() => onRowClick(call)}
                        className={`cursor-pointer hover:bg-yanne-light/10 transition-colors ${i % 2 === 1 ? 'bg-zinc-50/50' : ''}`}
                      >
                        {visibleCols.has('date') && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-800">
                            {call.date ? new Date(call.date).toLocaleDateString() : '\u2014'}
                          </td>
                        )}
                        {visibleCols.has('rep') && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-800">
                            <div className="flex items-center gap-2">
                              <div className={`h-2 w-2 rounded-full ${repDotClass(call.rep)}`} />
                              {call.rep}
                            </div>
                          </td>
                        )}
                        {visibleCols.has('prospect') && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                            <span className="font-medium text-yanne">{call.prospect_company ?? '\u2014'}</span>
                          </td>
                        )}
                        {visibleCols.has('type') && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-800">{call.call_type}</td>
                        )}
                        {visibleCols.has('score') && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${scoreBadgeColor(call.score_percentage)}`}>
                              {call.score_percentage}%
                            </span>
                          </td>
                        )}
                        {visibleCols.has('grade') && (
                          <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                            <GradeBadge grade={call.grade} />
                          </td>
                        )}
                        {visibleCols.has('coaching') && (
                          <td className="px-4 py-2.5 text-xs text-zinc-600 max-w-[200px] truncate">
                            {call.coaching_priority ?? '\u2014'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
