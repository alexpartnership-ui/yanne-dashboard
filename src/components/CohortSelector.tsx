interface CohortValue {
  start: string
  end: string
  preset: 'all' | '2025' | '2026_ytd' | 'custom'
}

interface Props {
  value: CohortValue
  onChange: (v: CohortValue) => void
}

const TODAY = new Date().toISOString().slice(0, 10)

const PRESETS: Array<{ key: CohortValue['preset']; label: string; start: string; end: string }> = [
  { key: 'all', label: 'All-time', start: '1900-01-01', end: '2099-12-31' },
  { key: '2025', label: '2025', start: '2025-01-01', end: '2025-12-31' },
  { key: '2026_ytd', label: '2026 YTD', start: '2026-01-01', end: TODAY },
  { key: 'custom', label: 'Custom', start: TODAY, end: TODAY },
]

export function CohortSelector({ value, onChange }: Props) {
  function handlePreset(preset: (typeof PRESETS)[number]) {
    if (preset.key === 'custom') {
      onChange({ preset: 'custom', start: value.start, end: value.end })
    } else {
      onChange({ preset: preset.key, start: preset.start, end: preset.end })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 rounded-lg bg-surface-raised border border-border p-1">
        {PRESETS.map(preset => (
          <button
            key={preset.key}
            onClick={() => handlePreset(preset)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 ${
              value.preset === preset.key
                ? 'bg-yanne-500 text-white shadow-sm'
                : 'text-text-secondary hover:bg-yanne-800/30 hover:text-text-primary'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.start}
            onChange={e => onChange({ ...value, start: e.target.value })}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary focus:border-yanne-500 focus:outline-none"
          />
          <span className="text-text-muted text-xs">→</span>
          <input
            type="date"
            value={value.end}
            onChange={e => onChange({ ...value, end: e.target.value })}
            className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text-secondary focus:border-yanne-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}
