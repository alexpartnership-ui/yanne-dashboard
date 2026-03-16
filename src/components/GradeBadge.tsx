import type { Grade } from '../types/database'

const gradeColors: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A':  'bg-emerald-100 text-emerald-800',
  'A-': 'bg-emerald-100 text-emerald-700',
  'B+': 'bg-sky-100 text-sky-800',
  'B':  'bg-sky-100 text-sky-800',
  'B-': 'bg-sky-100 text-sky-700',
  'C+': 'bg-amber-100 text-amber-800',
  'C':  'bg-amber-100 text-amber-800',
  'C-': 'bg-amber-100 text-amber-700',
  'D+': 'bg-orange-100 text-orange-800',
  'D':  'bg-orange-100 text-orange-800',
  'D-': 'bg-orange-100 text-orange-700',
  'F':  'bg-red-100 text-red-800',
}

export function GradeBadge({ grade }: { grade: Grade | null }) {
  if (!grade) return <span className="text-zinc-400">—</span>
  const color = gradeColors[grade] ?? 'bg-zinc-100 text-zinc-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {grade}
    </span>
  )
}
