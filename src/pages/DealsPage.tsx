import { useState, useCallback } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDeals } from '../hooks/useDeals'
import { useHubSpotDeals } from '../hooks/useHubSpotDeals'
import { useDealStaleness } from '../hooks/useDealStaleness'
import { DealCard } from '../components/DealCard'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import type { DealWithCalls, DealStage } from '../types/database'

// ─── HUBSPOT SIDE ───────────────────────────────────────

const HS_ACTIVE_STAGES = ['Meeting Qualified', 'NDA', '1st Closing Call', '2nd Closing Call', '3rd Call / Contract']

function stageColor(stage: string): string {
  if (stage === 'Closed Won') return 'bg-emerald-100 text-emerald-700'
  if (stage === 'Closed Lost' || stage === 'Disqualified') return 'bg-zinc-100 text-zinc-500'
  if (stage === 'Long Term Lead') return 'bg-blue-100 text-blue-700'
  return 'bg-yanne/10 text-yanne'
}

function daysSinceDate(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function HubSpotPanel() {
  const { data: hubspot, loading, error } = useHubSpotDeals()
  const [stageFilter, setStageFilter] = useState<string>('active')

  if (loading) return <div className="flex-1"><Spinner /></div>
  if (error) return <div className="flex-1 text-sm text-red-600">HubSpot: {error}</div>

  const deals = hubspot?.deals ?? []
  // Filter to Sales Pipeline only (default)
  const salesDeals = deals.filter(d => d.pipeline === 'default')

  const filtered = stageFilter === 'active'
    ? salesDeals.filter(d => HS_ACTIVE_STAGES.includes(d.stageName))
    : stageFilter === 'all'
    ? salesDeals
    : salesDeals.filter(d => d.stageName === stageFilter)

  const stages = [...new Set(salesDeals.map(d => d.stageName))].sort()

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-900">HubSpot Pipeline</h3>
          <p className="text-[10px] text-zinc-400">Business reality — stages, amounts, activity</p>
        </div>
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm"
        >
          <option value="active">Active Stages</option>
          <option value="all">All Deals</option>
          {stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-zinc-900">{salesDeals.filter(d => HS_ACTIVE_STAGES.includes(d.stageName)).length}</div>
          <div className="text-[9px] text-zinc-400">Active</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-emerald-600">{salesDeals.filter(d => d.stageName === 'Closed Won').length}</div>
          <div className="text-[9px] text-zinc-400">Won</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-zinc-400">{salesDeals.filter(d => d.stageName === 'Closed Lost').length}</div>
          <div className="text-[9px] text-zinc-400">Lost</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-zinc-900">${((hubspot?.totalValue ?? 0) / 1000).toFixed(0)}K</div>
          <div className="text-[9px] text-zinc-400">Pipeline Value</div>
        </div>
      </div>

      {/* Deal list */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm max-h-[600px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-zinc-50">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <th className="text-left px-3 py-2">Deal</th>
              <th className="text-left px-3 py-2">Stage</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-right px-3 py-2">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {filtered.map(d => {
              const days = daysSinceDate(d.lastModified)
              return (
                <tr key={d.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-3 py-2.5 text-sm font-medium text-zinc-800 max-w-[180px] truncate">{d.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stageColor(d.stageName)}`}>
                      {d.stageName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-600 text-right">
                    {d.amount ? `$${(d.amount / 1000).toFixed(0)}K` : '\u2014'}
                  </td>
                  <td className={`px-3 py-2.5 text-xs text-right ${days !== null && days >= 14 ? 'text-red-600 font-semibold' : 'text-zinc-400'}`}>
                    {days !== null ? `${days}d ago` : '\u2014'}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-xs text-zinc-400">No deals</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── SUPABASE SIDE (Kanban) ─────────────────────────────

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

function SupabasePanel() {
  const { data: initialData, loading, error } = useDeals()
  const [localDeals, setLocalDeals] = useState<DealWithCalls[] | null>(null)
  const deals = localDeals ?? initialData
  const { stalenessMap } = useDealStaleness(deals)
  const [toast, setToast] = useState<string | null>(null)
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
    const { error: err } = await supabase.from('deals').update({ current_stage: targetStage }).eq('deal_id', draggedId)
    if (err) {
      setDeals(prev => prev.map(d => d.deal_id === draggedId ? { ...d, current_stage: draggedDeal.current_stage } : d))
      setToast(`Failed: ${err.message}`)
    } else {
      setToast(`Moved ${draggedDeal.prospect_company} to ${targetStage}`)
    }
    setTimeout(() => setToast(null), 3000)
  }, [deals, setDeals])

  if (loading) return <div className="flex-1"><Spinner /></div>
  if (error) return <div className="flex-1 text-sm text-red-600">Supabase: {error}</div>

  const columns = KANBAN_COLUMNS.map(stage => ({
    stage,
    deals: deals
      .filter(d => d.current_stage === stage && d.deal_status === 'active')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  }))

  // Signed/lost summary
  const signedDeals = deals.filter(d => d.deal_status === 'signed')
  const lostDeals = deals.filter(d => d.deal_status === 'lost')
  const inflationCount = deals.filter(d => d.pipeline_inflation && d.deal_status === 'active').length

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-zinc-900">AI Scoring Pipeline</h3>
        <p className="text-[10px] text-zinc-400">Coaching intelligence — grades, scores, flags</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-zinc-900">{deals.filter(d => d.deal_status === 'active').length}</div>
          <div className="text-[9px] text-zinc-400">Active</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-emerald-600">{signedDeals.length}</div>
          <div className="text-[9px] text-zinc-400">Signed</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className="text-lg font-bold text-zinc-400">{lostDeals.length}</div>
          <div className="text-[9px] text-zinc-400">Lost</div>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-center shadow-sm">
          <div className={`text-lg font-bold ${inflationCount > 0 ? 'text-red-600' : 'text-zinc-900'}`}>{inflationCount}</div>
          <div className="text-[9px] text-zinc-400">Inflation Flags</div>
        </div>
      </div>

      {/* Kanban */}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-2">
          {columns.map(col => (
            <div key={col.stage}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-semibold text-yanne">{col.stage === 'Call 4' ? 'Call 4 / Close' : col.stage}</h4>
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500">{col.deals.length}</span>
              </div>
              <SortableContext items={col.deals.map(d => d.deal_id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 min-h-[60px]">
                  {col.deals.map(deal => (
                    <SortableDealCard key={deal.deal_id} deal={deal} staleness={stalenessMap.get(deal.deal_id)} />
                  ))}
                  {col.deals.length === 0 && (
                    <div className="rounded border border-dashed border-zinc-200 py-6 text-center text-[10px] text-zinc-400">Empty</div>
                  )}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>
      </DndContext>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── MISMATCH DETECTOR ──────────────────────────────────

function MismatchBanner({ supaDeals }: { supaDeals: DealWithCalls[] }) {
  const inflated = supaDeals.filter(d => d.pipeline_inflation && d.deal_status === 'active')
  if (inflated.length === 0) return null

  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-2 w-2 rounded-full bg-red-500" />
        <span className="text-xs font-bold text-red-800">Pipeline Mismatch Alert</span>
      </div>
      <div className="text-xs text-red-700">
        {inflated.length} deal{inflated.length > 1 ? 's' : ''} flagged for pipeline inflation in AI scoring but still active in pipeline:
        {' '}{inflated.map(d => d.prospect_company).join(', ')}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ──────────────────────────────────────────

export function DealsPage() {
  const { data: supaDeals } = useDeals()

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-yanne">Deal Pipeline</h2>
        <div className="text-[10px] text-zinc-400">Left: HubSpot (business) | Right: AI Scoring (coaching)</div>
      </div>

      <MismatchBanner supaDeals={supaDeals} />

      <div className="flex gap-4">
        <HubSpotPanel />
        <div className="w-px bg-zinc-200 shrink-0" />
        <SupabasePanel />
      </div>
    </div>
  )
}
