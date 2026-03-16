import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function AuthGuard() {
  const { authed } = useAuth()
  if (!authed) return <Navigate to="/login" replace />
  return <Outlet />
}
