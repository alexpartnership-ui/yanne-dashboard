import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface AuthGuardProps {
  allowedRoles?: string[]
}

export function AuthGuard({ allowedRoles }: AuthGuardProps) {
  const { authed, user } = useAuth()
  const location = useLocation()

  if (!authed) return <Navigate to="/login" state={{ from: location }} replace />
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
