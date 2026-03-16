import type { Grade } from '../types/database'

function gradeColor(grade: string): string {
  const letter = grade.charAt(0)
  if (letter === 'A') return 'bg-emerald-100 text-emerald-800'
  if (letter === 'B') return 'bg-emerald-50 text-emerald-700'
  if (letter === 'C') return 'bg-amber-100 text-amber-800'
  if (letter === 'D') return 'bg-orange-100 text-orange-800'
  if (letter === 'F') return 'bg-red-100 text-red-800'
  return 'bg-zinc-100 text-zinc-600'
}

export function GradeBadge({ grade }: { grade: Grade | null }) {
  if (!grade) return <span className="text-zinc-300">—</span>
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${gradeColor(grade)}`}>
      {grade}
    </span>
  )
}

export function scoreBadgeColor(score: number): string {
  if (score >= 75) return 'bg-emerald-100 text-emerald-800'
  if (score >= 60) return 'bg-amber-100 text-amber-800'
  if (score >= 50) return 'bg-orange-100 text-orange-800'
  return 'bg-red-100 text-red-800'
}
