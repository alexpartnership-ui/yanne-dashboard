import { useState, useCallback } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDeals } from '../hooks/useDeals'
import { useDealStaleness } from '../hooks/useDealStaleness'
import { DealCard } from '../components/DealCard'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { apiFetch } from '../hooks/useAuth'
import { ExportButton } from '../components/ExportButton'
import { useToast } from '../components/Toast'
import type { DealWithCalls, DealStage } from '../types/database'

const KANBAN_COLUMNS: DealStage[] = ['Call 1', 'Call 2', 'Call 3', 'Call 4']

function SortableDealCard({ deal, staleness }: { deal: DealWithCalls; staleness?: { days: number; level: 'none' | 'warning' | 'danger' } }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.deal_id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCard deal={deal} staleness={staleness} />
    </div>
  )
}

export function DealsAIPage() {
  const { data: initialData, loading, error } = useDeals()
  const [localDeals, setLocalDeals] = useState<DealWithCalls[] | null>(null)
  const deals = localDeals ?? initialData
  const { stalenessMap } = useDealStaleness(deals)
  const { toast } = useToast()
  const setDeals = useCallback((fn: (prev: DealWithCalls[]) => DealWithCalls[]) => {
    setLocalDeals(prev => fn(prev ?? initialData))
  }, [initialData])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const draggedId = active.id as string
    const draggedDeal = deals.find(d => d.deal_id === draggedId)
    if (!draggedDeal) return
    const overDeal = deals.find(d => d.deal_id === (over.id as string))
    const targetStage = overDeal?.current_stage
    if (!targetStage || targetStage === draggedDeal.current_stage) return

    setDeals(prev => prev.map(d => d.deal_id === draggedId ? { ...d, current_stage: targetStage } : d))
    try {
      const r = await apiFetch(`/api/deals/${draggedId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: targetStage }),
      })
      if (!r.ok) {
        setDeals(prev => prev.map(d => d.deal_id === draggedId ? { ...d, current_stage: draggedDeal.current_stage } : d))
        toast('Failed to update deal stage', 'error')
      } else {
        toast(`Moved ${draggedDeal.prospect_company} to ${targetStage}`, 'success')
      }
    } catch {
      setDeals(prev => prev.map(d => d.deal_id === draggedId ? { ...d, current_stage: draggedDeal.current_stage } : d))
      toast('Failed to update deal stage', 'error')
    }
  }, [deals, setDeals, toast])

  if (loading) return <Spinner />
  if (error) return <div className="text-sm text-red-600">{error}</div>

  const activeDeals = deals.filter(d => d.deal_status === 'active')
  const signedDeals = deals.filter(d => d.deal_status === 'signed')
  const lostDeals = deals.filter(d => d.deal_status === 'lost')
  const inflationCount = deals.filter(d => d.pipeline_inflation && d.deal_status === 'active').length

  const columns = KANBAN_COLUMNS.map(stage => ({
    stage,
    deals: activeDeals
      .filter(d => d.current_stage === stage)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  }))

  // Pipeline inflation banner
  const inflatedDeals = deals.filter(d => d.pipeline_inflation && d.deal_status === 'active')

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-yanne">AI Scoring Pipeline</h2>
          <p className="text-xs text-text-faint">Coaching intelligence — grades, scores, flags. Drag to move deals.</p>
        </div>
        <ExportButton type="deals" label="Export Deals" />
      </div>

      {/* Pipeline inflation alert */}
      {inflatedDeals.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-bold text-red-800">Pipeline Inflation Alert</span>
          </div>
          <div className="text-xs text-red-700">
            {inflatedDeals.length} deal{inflatedDeals.length > 1 ? 's' : ''} flagged:
            {' '}{inflatedDeals.map(d => d.prospect_company).join(', ')}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg bg-surface-raised border border-border p-4 shadow-sm text-center">
          <div className="text-2xl font-bold text-text-primary">{activeDeals.length}</div>
          <div className="text-[11px] text-text-muted mt-1">Active</div>
        </div>
        <div className="rounded-lg bg-surface-raised border border-border p-4 shadow-sm text-center">
          <div className="text-2xl font-bold text-emerald-600">{signedDeals.length}</div>
          <div className="text-[11px] text-text-muted mt-1">Signed</div>
        </div>
        <div className="rounded-lg bg-surface-raised border border-border p-4 shadow-sm text-center">
          <div className="text-2xl font-bold text-text-faint">{lostDeals.length}</div>
          <div className="text-[11px] text-text-muted mt-1">Lost</div>
        </div>
        <div className="rounded-lg bg-surface-raised border border-border p-4 shadow-sm text-center">
          <div className={`text-2xl font-bold ${inflationCount > 0 ? 'text-red-600' : 'text-text-primary'}`}>{inflationCount}</div>
          <div className="text-[11px] text-text-muted mt-1">Inflation Flags</div>
        </div>
      </div>

      {/* Kanban */}
      {activeDeals.length === 0 ? (
        <EmptyState title="No active deals" description="Deals will appear when calls are scored and linked to prospects" />
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {columns.map(col => (
              <div key={col.stage}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold text-yanne">{col.stage === 'Call 4' ? 'Call 4 / Close' : col.stage}</h4>
                  <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[9px] font-bold text-text-muted">{col.deals.length}</span>
                </div>
                <SortableContext items={col.deals.map(d => d.deal_id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5 min-h-[80px]">
                    {col.deals.map(deal => (
                      <SortableDealCard key={deal.deal_id} deal={deal} staleness={stalenessMap.get(deal.deal_id)} />
                    ))}
                    {col.deals.length === 0 && (
                      <div className="rounded border border-dashed border-border py-8 text-center text-[10px] text-text-faint">No deals</div>
                    )}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
        </DndContext>
      )}
    </div>
  )
}
