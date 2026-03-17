import { useState, useCallback } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../hooks/useDeals'
import { useDealStaleness } from '../hooks/useDealStaleness'
import { DataTable } from '../components/DataTable'
import { DealCard } from '../components/DealCard'
import { GradeBadge } from '../components/GradeBadge'
import { Spinner } from '../components/Spinner'
import { repDotClass } from '../lib/repColors'
import { supabase } from '../lib/supabase'
import type { DealWithCalls, DealStage, Grade } from '../types/database'

type ViewMode = 'kanban' | 'table'

const KANBAN_COLUMNS: DealStage[] = ['Call 1', 'Call 2', 'Call 3', 'Call 4']

// ─── SORTABLE CARD ─────────────────────────────────────

function SortableDealCard({ deal, staleness }: { deal: DealWithCalls; staleness?: ReturnType<typeof useDealStaleness>['stalenessMap'] extends Map<string, infer V> ? V : never }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.deal_id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCard deal={deal} staleness={staleness} />
    </div>
  )
}

// ─── DROPPABLE COLUMN ──────────────────────────────────

function KanbanColumn({ stage, deals, stalenessMap }: {
  stage: DealStage
  deals: DealWithCalls[]
  stalenessMap: Map<string, { days: number; level: 'none' | 'warning' | 'danger' }>
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-yanne">{stage === 'Call 4' ? 'Call 4 / Close' : stage}</h3>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
          {deals.length}
        </span>
      </div>
      <SortableContext items={deals.map(d => d.deal_id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[80px]">
          {deals.map(deal => (
            <SortableDealCard
              key={deal.deal_id}
              deal={deal}
              staleness={stalenessMap.get(deal.deal_id)}
            />
          ))}
          {deals.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-400">
              No deals
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── KANBAN VIEW ────────────────────────────────────────

function KanbanView({ deals, setDeals, stalenessMap }: {
  deals: DealWithCalls[]
  setDeals: (fn: (prev: DealWithCalls[]) => DealWithCalls[]) => void
  stalenessMap: Map<string, { days: number; level: 'none' | 'warning' | 'danger' }>
}) {
  const [toast, setToast] = useState<string | null>(null)

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = active.id as string
    const draggedDeal = deals.find(d => d.deal_id === draggedId)
    if (!draggedDeal) return

    // Figure out which column it was dropped into
    // The over.id could be another deal id or empty — find which column contains the over target
    const overId = over.id as string
    const overDeal = deals.find(d => d.deal_id === overId)

    let targetStage: DealStage | null = null
    if (overDeal) {
      targetStage = overDeal.current_stage
    }

    if (!targetStage || targetStage === draggedDeal.current_stage) return

    // Optimistic update
    setDeals(prev => prev.map(d =>
      d.deal_id === draggedId ? { ...d, current_stage: targetStage } : d
    ))

    // Persist to Supabase
    const { error } = await supabase
      .from('deals')
      .update({ current_stage: targetStage })
      .eq('deal_id', draggedId)

    if (error) {
      // Revert on failure
      setDeals(prev => prev.map(d =>
        d.deal_id === draggedId ? { ...d, current_stage: draggedDeal.current_stage } : d
      ))
      setToast(`Failed to move deal: ${error.message}`)
    } else {
      setToast(`Moved ${draggedDeal.prospect_company} to ${targetStage}`)
    }

    setTimeout(() => setToast(null), 3000)
  }, [deals, setDeals])

  const columns = KANBAN_COLUMNS.map(stage => ({
    stage,
    deals: deals
      .filter(d => d.current_stage === stage && d.deal_status === 'active')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  }))

  return (
    <>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {columns.map(col => (
            <KanbanColumn
              key={col.stage}
              stage={col.stage}
              deals={col.deals}
              stalenessMap={stalenessMap}
            />
          ))}
        </div>
      </DndContext>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </>
  )
}

// ─── TABLE VIEW ─────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function dealHealth(deal: DealWithCalls): { label: string; color: string } {
  if (deal.deal_status === 'signed') return { label: 'Signed', color: 'bg-blue-100 text-blue-800' }
  if (deal.deal_status === 'lost') return { label: 'Lost', color: 'bg-zinc-100 text-zinc-500' }
  const days = daysSince(deal.updated_at)
  if (days !== null && days >= 21) return { label: 'At Risk', color: 'bg-red-100 text-red-800' }
  if (days !== null && days >= 14) return { label: 'Stalled', color: 'bg-amber-100 text-amber-800' }
  return { label: 'Active', color: 'bg-emerald-100 text-emerald-800' }
}

function ClickableGrade({ grade, callId }: { grade: Grade | null; callId: string | null }) {
  const navigate = useNavigate()
  if (!grade) return <span className="text-zinc-300">{'\u2014'}</span>
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
      if (days === null) return <span className="text-zinc-300">{'\u2014'}</span>
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
    ) : <span className="text-zinc-300">{'\u2014'}</span>,
  }),
]

// ─── MAIN PAGE ──────────────────────────────────────────

export function DealsPage() {
  const { data: initialData, loading, error } = useDeals()
  const [localDeals, setLocalDeals] = useState<DealWithCalls[] | null>(null)
  const deals = localDeals ?? initialData
  const { stalenessMap } = useDealStaleness(deals)
  const [view, setView] = useState<ViewMode>('kanban')

  // Sync initial data when it loads
  const setDeals = useCallback((fn: (prev: DealWithCalls[]) => DealWithCalls[]) => {
    setLocalDeals(prev => fn(prev ?? initialData))
  }, [initialData])

  if (loading) return <Spinner />
  if (error) return <p className="text-sm text-red-600">Error: {error}</p>

  const activeCount = deals.filter(d => d.deal_status === 'active').length
  const stalledCount = deals.filter(d => {
    const s = stalenessMap.get(d.deal_id)
    return d.deal_status === 'active' && s && s.level === 'danger'
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
        <KanbanView deals={deals} setDeals={setDeals} stalenessMap={stalenessMap} />
      ) : (
        <DataTable data={deals} columns={tableColumns} striped />
      )}
    </div>
  )
}
