/**
 * AuthGuard — redirects unauthenticated users to /auth.
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <>{children}</>
}

