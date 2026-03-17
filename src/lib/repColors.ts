export const REP_COLORS: Record<string, { dot: string; bg: string; border: string }> = {
  Jake:    { dot: 'bg-blue-500',   bg: 'bg-blue-50',   border: 'border-l-blue-500' },
  Stanley: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-l-emerald-500' },
  Thomas:  { dot: 'bg-violet-500', bg: 'bg-violet-50', border: 'border-l-violet-500' },
  Tahawar: { dot: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-l-amber-500' },
}

export function repDotClass(rep: string): string {
  return REP_COLORS[rep]?.dot ?? 'bg-zinc-400'
}

export function repBorderClass(rep: string): string {
  return REP_COLORS[rep]?.border ?? 'border-l-zinc-400'
}

export const REP_HEX: Record<string, string> = {
  Jake: '#3B82F6',
  Stanley: '#22C55E',
  Thomas: '#8B5CF6',
  Tahawar: '#F59E0B',
}
