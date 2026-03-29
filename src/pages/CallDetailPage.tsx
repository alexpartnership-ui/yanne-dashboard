import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCallDetail } from '../hooks/useCallDetail'
import { GradeBadge } from '../components/GradeBadge'
import { Spinner } from '../components/Spinner'
import type { CategoryScore, PenaltyOrBonus } from '../types/database'

export function CallDetailPage() {
  const { id } = useParams()
  const { data: call, loading, error } = useCallDetail(id)
  const [showFull, setShowFull] = useState(false)

  if (loading) return <Spinner />
  if (error || !call) return <p className="text-red-600 p-4">Error: {error ?? 'Not found'}</p>

  const categories: CategoryScore[] = Array.isArray(call.category_scores) ? call.category_scores : []
  const penalties: PenaltyOrBonus[] = Array.isArray(call.penalties) ? call.penalties : []
  const bonuses: PenaltyOrBonus[] = Array.isArray(call.bonuses) ? call.bonuses : []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back link */}
      <Link to="/calls" className="text-sm text-text-muted hover:text-text-secondary">&larr; Back to calls</Link>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              {call.prospect_company ?? 'Unknown Prospect'}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {call.rep} &middot; {call.call_type} &middot; {call.date ? new Date(call.date).toLocaleDateString() : '—'}
              {call.duration_minutes ? ` \u00B7 ${call.duration_minutes} min` : ''}
            </p>
            {call.prospect_contact && (
              <p className="mt-1 text-sm text-text-muted">Contact: {call.prospect_contact}</p>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-text-primary">{call.score_percentage}%</span>
              <GradeBadge grade={call.grade} />
            </div>
            <p className="mt-1 text-xs text-text-muted">{call.total_score} / {call.max_possible} pts</p>
          </div>
        </div>
        {call.gdrive_doc_url && (
          <a
            href={call.gdrive_doc_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800"
          >
            View Google Doc scorecard &rarr;
          </a>
        )}
      </div>

      {/* Category Scores */}
      {categories.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-muted">Category Scores</h3>
          <div className="space-y-3">
            {categories.map((cat, i) => (
              <div key={i}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{cat.category}</span>
                  <span className="font-medium text-text-primary">{cat.score}/{cat.max}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-overlay">
                  <div
                    className="h-2 rounded-full bg-slate-700 transition-all"
                    style={{ width: `${cat.max > 0 ? (cat.score / cat.max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Penalties & Bonuses */}
      {(penalties.length > 0 || bonuses.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {penalties.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-600">
                Penalties ({call.penalties_total} pts)
              </h3>
              <ul className="space-y-2">
                {penalties.map((p, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-red-700">{p.points > 0 ? '-' : ''}{Math.abs(p.points)} pts</span>
                    <span className="ml-2 text-text-secondary">{p.name}</span>
                    {p.reason && <p className="ml-2 text-xs text-text-muted">{p.reason}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bonuses.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-600">
                Bonuses (+{call.bonuses_total} pts)
              </h3>
              <ul className="space-y-2">
                {bonuses.map((b, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-emerald-700">+{b.points} pts</span>
                    <span className="ml-2 text-text-secondary">{b.name}</span>
                    {b.reason && <p className="ml-2 text-xs text-text-muted">{b.reason}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Strengths / Gaps / Biggest Miss */}
      <div className="grid gap-4 md:grid-cols-3">
        {call.strengths_top3 && call.strengths_top3.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-600">Strengths</h3>
            <ul className="space-y-1">
              {call.strengths_top3.map((s, i) => (
                <li key={i} className="text-sm text-text-secondary">{s}</li>
              ))}
            </ul>
          </div>
        )}
        {call.gaps_top3 && call.gaps_top3.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-600">Gaps</h3>
            <ul className="space-y-1">
              {call.gaps_top3.map((g, i) => (
                <li key={i} className="text-sm text-text-secondary">{g}</li>
              ))}
            </ul>
          </div>
        )}
        {call.biggest_miss && (
          <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-600">Biggest Miss</h3>
            <p className="text-sm text-text-secondary">{call.biggest_miss}</p>
          </div>
        )}
      </div>

      {/* Coaching Priority */}
      {call.coaching_priority && (
        <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">Coaching Priority</h3>
          <p className="text-sm text-text-secondary">{call.coaching_priority}</p>
        </div>
      )}

      {/* Qualification (Call 1 only) */}
      {call.qualification_result && (
        <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">Qualification</h3>
          <div className="flex items-center gap-4">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              call.qualification_result === 'QUALIFIED' ? 'bg-emerald-100 text-emerald-800' :
              call.qualification_result === 'BORDERLINE' ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-800'
            }`}>
              {call.qualification_result}
            </span>
            {call.pipeline_inflation && (
              <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                Pipeline Inflation
              </span>
            )}
            {call.next_step_flag && call.next_step_flag !== 'NONE' && (
              <span className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                {call.next_step_flag}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Full Scorecard (collapsible) */}
      {call.full_scorecard_text && (
        <div className="rounded-lg border border-border bg-surface-raised shadow-sm">
          <button
            onClick={() => setShowFull(!showFull)}
            className="w-full px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider text-text-muted hover:bg-surface-raised transition-colors"
          >
            {showFull ? 'Hide' : 'Show'} Full Scorecard
          </button>
          {showFull && (
            <pre className="max-h-[600px] overflow-auto border-t border-border px-6 py-4 text-xs text-text-secondary whitespace-pre-wrap">
              {call.full_scorecard_text}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
