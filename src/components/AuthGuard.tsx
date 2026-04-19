import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface AuthGuardProps {
  allowedRoles?: Array<'admin' | 'manager' | 'member'>
  allowedPillars?: string[]
}

function firstAccessiblePath(pillarAccess: string[]): string {
  if (pillarAccess.includes('*') || pillarAccess.includes('sales')) return '/dashboard'
  if (pillarAccess.includes('campaigns')) return '/outbound/email'
  if (pillarAccess.includes('fulfillment')) return '/clients/overview'
  if (pillarAccess.includes('investor-relations')) return '/relationships/investors'
  if (pillarAccess.includes('goals')) return '/ceo'
  return '/login'
}

export function AuthGuard({ allowedRoles, allowedPillars }: AuthGuardProps) {
  const { authed, user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-sunken">
        <div className="flex items-center gap-3 text-text-faint">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Checking session…</span>
        </div>
      </div>
    )
  }
  if (!authed || !user) return <Navigate to="/login" state={{ from: location }} replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={firstAccessiblePath(user.pillar_access)} replace />
  }
  if (allowedPillars && allowedPillars.length > 0) {
    const hasAccess = user.pillar_access.includes('*') ||
      allowedPillars.some(p => user.pillar_access.includes(p))
    if (!hasAccess) return <Navigate to={firstAccessiblePath(user.pillar_access)} replace />
  }
  return <Outlet />
}
