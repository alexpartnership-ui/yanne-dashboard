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

  if (loading) return null
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
