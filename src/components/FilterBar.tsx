import type { RepName, CallType, Grade } from '../types/database'
import type { CallFilters, DateRange } from '../hooks/useCallLogs'

const reps: RepName[] = ['Jake', 'Stanley', 'Thomas', 'Tahawar']
const callTypes: CallType[] = ['Call 1', 'Call 2', 'Call 3', 'Misc']
const grades: Grade[] = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']

const dateOptions: { label: string; value: DateRange }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: '7d' },
  { label: 'This Month', value: '30d' },
  { label: 'All Time', value: 'all' },
]

interface FilterBarProps {
  filters: CallFilters
  onChange: (filters: CallFilters) => void
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const selectClass = 'rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary focus:border-yanne focus:outline-none shadow-sm'
  const activeDateRange = filters.dateRange ?? 'all'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date quick filters */}
      <div className="flex rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
        {dateOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filters, dateRange: opt.value })}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              activeDateRange === opt.value
                ? 'bg-yanne text-white'
                : 'text-text-muted hover:bg-surface-raised'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <select
        className={selectClass}
        value={filters.rep ?? ''}
        onChange={e => onChange({ ...filters, rep: (e.target.value || undefined) as RepName | undefined })}
      >
        <option value="">All Reps</option>
        {reps.map(r => <option key={r} value={r}>{r}</option>)}
      </select>

      <select
        className={selectClass}
        value={filters.call_type ?? ''}
        onChange={e => onChange({ ...filters, call_type: (e.target.value || undefined) as CallType | undefined })}
      >
        <option value="">All Types</option>
        {callTypes.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select
        className={selectClass}
        value={filters.grade ?? ''}
        onChange={e => onChange({ ...filters, grade: (e.target.value || undefined) as Grade | undefined })}
      >
        <option value="">All Grades</option>
        {grades.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
    </div>
  )
}
