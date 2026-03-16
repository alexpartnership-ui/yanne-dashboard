import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { useDeals } from '../hooks/useDeals'
import { DataTable } from '../components/DataTable'
import { GradeBadge } from '../components/GradeBadge'
import { Spinner } from '../components/Spinner'
import { repDotClass } from '../lib/repColors'
import type { DealWithCalls, Grade } from '../types/database'

type ViewMode = 'kanban' | 'table'

// Calculate days since a date
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

// Get the latest grade from a deal
function latestGrade(deal: DealWithCalls): Grade | null {
  if (deal.call_4_grade) return deal.call_4_grade
  if (deal.call_3_grade) return deal.call_3_grade
  if (deal.call_2_grade) return deal.call_2_grade
  return deal.call_1_grade
}

// Derive deal health status
function dealHealth(deal: DealWithCalls): { label: string; color: string } {
  if (deal.deal_status === 'signed') return { label: 'Signed', color: 'bg-blue-100 text-blue-800' }
  if (deal.deal_status === 'lost') return { label: 'Lost', color: 'bg-zinc-100 text-zinc-500' }

  const days = daysSince(deal.updated_at)
  if (days !== null && days >= 21) return { label: 'At Risk', color: 'bg-red-100 text-red-800' }
  if (days !== null && days >= 14) return { label: 'Stalled', color: 'bg-amber-100 text-amber-800' }
  return { label: 'Active', color: 'bg-emerald-100 text-emerald-800' }
}

// ─── KANBAN VIEW ────────────────────────────────────────

const KANBAN_COLUMNS = ['Call 1', 'Call 2', 'Call 3', 'Call 4'] as const

function KanbanView({ deals }: { deals: DealWithCalls[] }) {
  const navigate = useNavigate()

  const columns = KANBAN_COLUMNS.map(stage => ({
    stage,
    deals: deals
      .filter(d => d.current_stage === stage && d.deal_status === 'active')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  }))

  return (
    <div className="grid grid-cols-4 gap-4">
      {columns.map(col => (
        <div key={col.stage}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-yanne">{col.stage === 'Call 4' ? 'Call 4 / Close' : col.stage}</h3>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
              {col.deals.length}
            </span>
          </div>

          <div className="space-y-2">
            {col.deals.map(deal => {
              const days = daysSince(deal.updated_at)
              const grade = latestGrade(deal)
              const health = dealHealth(deal)

              return (
                <div
                  key={deal.deal_id}
                  onClick={() => {
                    // Navigate to latest call detail
                    const callId = deal.call_4_record_id || deal.call_3_record_id || deal.call_2_record_id || deal.call_1_record_id
                    if (callId) navigate(`/calls/${callId}`)
                  }}
                  className="rounded-lg border border-zinc-200 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-yanne-light transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold text-sm text-zinc-900 leading-tight">{deal.prospect_company}</div>
                    {grade && <GradeBadge grade={grade} />}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-2 w-2 rounded-full ${repDotClass(deal.rep_name)}`} />
                    <span className="text-xs text-zinc-500">{deal.rep_name}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    {days !== null && (
                      <span className={`text-[10px] ${days >= 14 ? 'text-red-500 font-semibold' : 'text-zinc-400'}`}>
                        {days}d in stage
                      </span>
                    )}

                    {deal.pipeline_inflation && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-100" title="Pipeline Inflation">
                        <svg className="h-2.5 w-2.5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}

                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${health.color}`}>
                      {health.label}
                    </span>
                  </div>
                </div>
              )
            })}

            {col.deals.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-400">
                No deals
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TABLE VIEW ─────────────────────────────────────────

function ClickableGrade({ grade, callId }: { grade: Grade | null; callId: string | null }) {
  const navigate = useNavigate()
  if (!grade) return <span className="text-zinc-300">—</span>
  return (
    <span
      className={callId ? 'cursor-pointer' : ''}
      onClick={e => {
        if (callId) { e.stopPropagation(); navigate(`/calls/${callId}`) }
      }}
    >
      <GradeBadge grade={grade} />
    </span>
  )
}

const tcol = createColumnHelper<DealWithCalls>()

const tableColumns = [
  tcol.accessor('prospect_company', {
    header: 'Company',
    cell: info => <span className="font-medium text-zinc-900">{info.getValue()}</span>,
  }),
  tcol.accessor('rep_name', {
    header: 'Rep',
    cell: info => (
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${repDotClass(info.getValue())}`} />
        <span>{info.getValue()}</span>
      </div>
    ),
  }),
  tcol.accessor('current_stage', { header: 'Stage' }),
  tcol.display({
    id: 'health',
    header: 'Status',
    cell: ({ row }) => {
      const health = dealHealth(row.original)
      return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${health.color}`}>{health.label}</span>
    },
  }),
  tcol.display({
    id: 'last_activity',
    header: 'Last Activity',
    cell: ({ row }) => {
      const days = daysSince(row.original.updated_at)
      if (days === null) return <span className="text-zinc-300">—</span>
      return <span className={`text-sm ${days >= 14 ? 'text-red-600 font-semibold' : 'text-zinc-600'}`}>{days}d ago</span>
    },
  }),
  tcol.display({ id: 'c1', header: 'C1', cell: ({ row }) => <ClickableGrade grade={row.original.call_1_grade} callId={row.original.call_1_record_id} /> }),
  tcol.display({ id: 'c2', header: 'C2', cell: ({ row }) => <ClickableGrade grade={row.original.call_2_grade} callId={row.original.call_2_record_id} /> }),
  tcol.display({ id: 'c3', header: 'C3', cell: ({ row }) => <ClickableGrade grade={row.original.call_3_grade} callId={row.original.call_3_record_id} /> }),
  tcol.display({ id: 'c4', header: 'C4', cell: ({ row }) => <ClickableGrade grade={row.original.call_4_grade} callId={row.original.call_4_record_id} /> }),
  tcol.accessor('pipeline_inflation', {
    header: 'Flag',
    cell: info => info.getValue() ? (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Inflation</span>
    ) : <span className="text-zinc-300">—</span>,
  }),
]

// ─── MAIN PAGE ──────────────────────────────────────────

export function DealsPage() {
  const { data, loading, error } = useDeals()
  const [view, setView] = useState<ViewMode>('kanban')

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>

  const activeCount = data.filter(d => d.deal_status === 'active').length
  const stalledCount = data.filter(d => {
    const days = daysSince(d.updated_at)
    return d.deal_status === 'active' && days !== null && days >= 14
  }).length

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-yanne">Deal Pipeline</h2>
          <span className="text-sm text-zinc-500">{activeCount} active{stalledCount > 0 ? `, ${stalledCount} stalled` : ''}</span>
        </div>

        <div className="flex rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setView('kanban')}
            className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${view === 'kanban' ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${view === 'table' ? 'bg-yanne text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            Table
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <KanbanView deals={data} />
      ) : (
        <DataTable data={data} columns={tableColumns} striped />
      )}
    </div>
  )
}
