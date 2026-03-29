import type { Grade } from '../types/database'

function gradeColor(grade: string): string {
  const letter = grade.charAt(0)
  if (letter === 'A') return 'bg-[#166534] text-white'
  if (letter === 'B') return 'bg-[#22C55E] text-white'
  if (letter === 'C') return 'bg-[#EAB308] text-black'
  if (letter === 'D') return 'bg-[#F97316] text-white'
  if (letter === 'F') return 'bg-[#EF4444] text-white'
  return 'bg-surface-overlay text-text-muted'
}

export function GradeBadge({ grade }: { grade: Grade | null }) {
  if (!grade) return <span className="text-text-faint">—</span>
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
