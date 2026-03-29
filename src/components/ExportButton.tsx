import { useState } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useToast } from './Toast'

interface ExportButtonProps {
  type: 'calls' | 'deals' | 'reps'
  label?: string
}

export function ExportButton({ type, label }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function handleExport() {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/export/${type}`)
      if (!res.ok) {
        const err = await res.json()
        toast(err.error || 'Export failed', 'error')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `yanne_${type}_export.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast(`${type} exported successfully`, 'success')
    } catch {
      toast('Export failed', 'error')
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-md border border-border-strong bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-raised disabled:opacity-50"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      {loading ? 'Exporting...' : label || 'Export CSV'}
    </button>
  )
}
