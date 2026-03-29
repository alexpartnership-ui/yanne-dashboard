import type { CallLog } from '../types/database'

const GRADE_COLORS = { A: 'bg-[#166534]', B: 'bg-[#22C55E]', C: 'bg-[#EAB308]', D: 'bg-[#F97316]', F: 'bg-[#EF4444]' }

export function GradeDistributionBar({ calls }: { calls: Pick<CallLog, 'grade'>[] }) {
  const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const c of calls) {
    if (!c.grade) continue
    const letter = c.grade.charAt(0) as keyof typeof counts
    if (letter in counts) counts[letter]++
  }
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  if (total === 0) return <div className="text-xs text-text-faint">No grades</div>

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-overlay">
        {(Object.keys(counts) as (keyof typeof counts)[]).map(g =>
          counts[g] > 0 ? (
            <div key={g} className={`${GRADE_COLORS[g]} transition-all`} style={{ width: `${(counts[g] / total) * 100}%` }} />
          ) : null
        )}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-text-muted">
        {(Object.keys(counts) as (keyof typeof counts)[]).map(g =>
          counts[g] > 0 ? <span key={g}>{g}: {counts[g]}</span> : null
        )}
      </div>
    </div>
  )
}
