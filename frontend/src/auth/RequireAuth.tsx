import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { roleHome, useAuth } from './AuthContext'

/**
 * Route guard. Unauthenticated → /login (remembering the intended path in
 * location.state.from for a post-login redirect). Authenticated but wrong role →
 * the role's home (empty `roles` = [] forbids everyone, keeping /gates disabled).
 */
export function RequireAuth({
  roles,
  children,
}: {
  roles?: string[]
  children: ReactNode
}) {
  const { auth } = useAuth()
  const location = useLocation()

  if (!auth) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }
  if (roles && (!auth.role || !roles.includes(auth.role))) {
    return <Navigate to={roleHome(auth.role)} replace />
  }
  return <>{children}</>
}
