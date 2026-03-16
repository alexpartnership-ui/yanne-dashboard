import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallLogs, type CallFilters } from '../hooks/useCallLogs'
import { DataTable } from '../components/DataTable'
import { FilterBar } from '../components/FilterBar'
import { GradeBadge } from '../components/GradeBadge'
import { Spinner } from '../components/Spinner'
import type { CallLog } from '../types/database'

const col = createColumnHelper<CallLog>()

const columns = [
  col.accessor('date', {
    header: 'Date',
    cell: info => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : '—',
  }),
  col.accessor('rep', { header: 'Rep' }),
  col.accessor('prospect_company', {
    header: 'Prospect',
    cell: info => info.getValue() ?? '—',
  }),
  col.accessor('call_type', { header: 'Type' }),
  col.accessor('score_percentage', {
    header: 'Score',
    cell: info => `${info.getValue()}%`,
  }),
  col.accessor('grade', {
    header: 'Grade',
    cell: info => <GradeBadge grade={info.getValue()} />,
  }),
  col.accessor('coaching_priority', {
    header: 'Coaching Priority',
    cell: info => {
      const val = info.getValue()
      return val ? (
        <span className="max-w-xs truncate block text-zinc-600 text-xs">{val}</span>
      ) : '—'
    },
  }),
]

export function CallsPage() {
  const [filters, setFilters] = useState<CallFilters>({})
  const { data, loading, error } = useCallLogs(filters)
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Scored Calls</h2>
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">Error: {error}</p>}

      {loading ? (
        <Spinner />
      ) : (
        <DataTable
          data={data}
          columns={columns}
          onRowClick={row => navigate(`/calls/${row.id}`)}
        />
      )}
    </div>
  )
}
