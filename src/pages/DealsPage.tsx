import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { useDeals } from '../hooks/useDeals'
import { DataTable } from '../components/DataTable'
import { GradeBadge } from '../components/GradeBadge'
import { Spinner } from '../components/Spinner'
import type { DealWithCalls, Grade } from '../types/database'

const col = createColumnHelper<DealWithCalls>()

function ClickableGrade({ grade, callId }: { grade: Grade | null; callId: string | null }) {
  const navigate = useNavigate()
  if (!grade) return <span className="text-zinc-400">—</span>
  return (
    <span
      className={callId ? 'cursor-pointer' : ''}
      onClick={e => {
        if (callId) {
          e.stopPropagation()
          navigate(`/calls/${callId}`)
        }
      }}
    >
      <GradeBadge grade={grade} />
    </span>
  )
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  signed: 'bg-zinc-100 text-zinc-600',
  lost: 'bg-red-100 text-red-800',
}

const columns = [
  col.accessor('prospect_company', { header: 'Company' }),
  col.accessor('rep_name', { header: 'Rep' }),
  col.accessor('current_stage', { header: 'Stage' }),
  col.accessor('deal_status', {
    header: 'Status',
    cell: info => {
      const val = info.getValue()
      return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[val] ?? ''}`}>
          {val}
        </span>
      )
    },
  }),
  col.display({
    id: 'c1',
    header: 'C1',
    cell: ({ row }) => <ClickableGrade grade={row.original.call_1_grade} callId={row.original.call_1_record_id} />,
  }),
  col.display({
    id: 'c2',
    header: 'C2',
    cell: ({ row }) => <ClickableGrade grade={row.original.call_2_grade} callId={row.original.call_2_record_id} />,
  }),
  col.display({
    id: 'c3',
    header: 'C3',
    cell: ({ row }) => <ClickableGrade grade={row.original.call_3_grade} callId={row.original.call_3_record_id} />,
  }),
  col.display({
    id: 'c4',
    header: 'C4',
    cell: ({ row }) => <ClickableGrade grade={row.original.call_4_grade} callId={row.original.call_4_record_id} />,
  }),
  col.accessor('pipeline_inflation', {
    header: 'Flag',
    cell: info => info.getValue() ? (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
        Inflation
      </span>
    ) : null,
  }),
]

export function DealsPage() {
  const { data, loading } = useDeals()

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">Deal Pipeline</h2>
      {loading ? <Spinner /> : <DataTable data={data} columns={columns} />}
    </div>
  )
}
