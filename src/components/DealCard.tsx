import { useNavigate } from 'react-router-dom'
import { GradeBadge } from './GradeBadge'
import { repDotClass } from '../lib/repColors'
import type { DealWithCalls, Grade } from '../types/database'
import type { DealStaleness } from '../hooks/useDealStaleness'

function latestGrade(deal: DealWithCalls): Grade | null {
  if (deal.call_4_grade) return deal.call_4_grade
  if (deal.call_3_grade) return deal.call_3_grade
  if (deal.call_2_grade) return deal.call_2_grade
  return deal.call_1_grade
}

function dealHealth(deal: DealWithCalls): { label: string; color: string } {
  if (deal.deal_status === 'signed') return { label: 'Signed', color: 'bg-blue-100 text-blue-800' }
  if (deal.deal_status === 'lost') return { label: 'Lost', color: 'bg-zinc-100 text-zinc-500' }
  const updated = deal.updated_at ? new Date(deal.updated_at) : null
  if (updated) {
    const days = Math.floor((Date.now() - updated.getTime()) / 86400000)
    if (days >= 21) return { label: 'At Risk', color: 'bg-red-100 text-red-800' }
    if (days >= 14) return { label: 'Stalled', color: 'bg-amber-100 text-amber-800' }
  }
  return { label: 'Active', color: 'bg-emerald-100 text-emerald-800' }
}

interface DealCardProps {
  deal: DealWithCalls
  staleness?: DealStaleness
  dragHandleProps?: Record<string, unknown>
}

export function DealCard({ deal, staleness, dragHandleProps }: DealCardProps) {
  const navigate = useNavigate()
  const grade = latestGrade(deal)
  const health = dealHealth(deal)

  const borderClass = staleness?.level === 'danger'
    ? 'border-red-400'
    : staleness?.level === 'warning'
    ? 'border-yellow-400'
    : 'border-zinc-200'

  return (
    <div
      {...dragHandleProps}
      onClick={() => {
        const callId = deal.call_4_record_id || deal.call_3_record_id || deal.call_2_record_id || deal.call_1_record_id
        if (callId) navigate(`/calls/${callId}`)
      }}
      className={`rounded-lg border ${borderClass} bg-white p-3.5 shadow-sm hover:shadow-md hover:border-yanne-light transition-all cursor-pointer`}
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
        {staleness && staleness.days > 0 && (
          <span className={`text-[10px] ${staleness.level === 'danger' ? 'text-red-500 font-semibold' : staleness.level === 'warning' ? 'text-yellow-600 font-semibold' : 'text-zinc-400'}`}>
            {staleness.level === 'danger' && '\u26A0\uFE0F '}
            {staleness.days}d in stage
            {staleness.level === 'danger' && ' stale'}
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
}
