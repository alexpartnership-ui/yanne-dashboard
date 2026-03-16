import type { RepName, CallType, Grade } from '../types/database'
import type { CallFilters } from '../hooks/useCallLogs'

const reps: RepName[] = ['Jake', 'Stanley', 'Thomas', 'Tahawar']
const callTypes: CallType[] = ['Call 1', 'Call 2', 'Call 3', 'Misc']
const grades: Grade[] = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']

interface FilterBarProps {
  filters: CallFilters
  onChange: (filters: CallFilters) => void
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const selectClass = 'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none'

  return (
    <div className="flex items-center gap-3">
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
