import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type AuthSession,
  clearStoredSession,
  getStoredSession,
  setStoredSession,
} from '../api'

// Role sets mirror DashboardScreen TILES + the backend @Roles for each screen. A route
// guard reproduces the same visibility the dashboard tiles use. `scan` adds `guard`
// because a guard lands on /scan directly. `gates` is [] → always forbidden (disabled).
export const DASHBOARD_ROLES = [
  'super_admin',
  'branch_head',
  'supervisor',
  'department_manager',
  'hr_head',
  'hr',
  'permit_officer',
]
export const SCAN_ROLES = ['super_admin', 'branch_head', 'supervisor', 'guard']
export const EMPLOYEE_ROLES = ['super_admin', 'branch_head', 'supervisor', 'hr', 'hr_head']
export const PERMIT_ROLES = ['super_admin', 'branch_head', 'supervisor', 'permit_officer']
export const REPORTS_ROLES = [
  'super_admin',
  'branch_head',
  'supervisor',
  'department_manager',
  'hr_head',
  'hr',
]
export const USERS_ROLES = ['super_admin', 'department_manager', 'branch_head']
export const GATES_ROLES: string[] = [] // HIDDEN — gates disabled; re-add roles to re-enable

interface AuthContextValue {
  auth: AuthSession | null
  login: (session: AuthSession) => void
  logout: () => void
}

const AuthCtx = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  initialAuth,
}: {
  children: ReactNode
  // Tests inject a session; production omits it and the lazy getStoredSession rehydrates
  // from sessionStorage (so a same-tab refresh keeps the user logged in).
  initialAuth?: AuthSession | null
}) {
  const [auth, setAuth] = useState<AuthSession | null>(
    initialAuth ?? getStoredSession,
  )
  const login = useCallback((session: AuthSession) => {
    setStoredSession(session)
    setAuth(session)
  }, [])
  const logout = useCallback(() => {
    clearStoredSession()
    setAuth(null)
  }, [])
  return (
    <AuthCtx.Provider value={{ auth, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Where a role lands after login: guard → scan, employee → barcode, admins → hub. */
export function roleHome(role: string | null): string {
  if (role === 'guard') return '/scan'
  if (role === 'employee') return '/my-barcode'
  return '/'
}

/** Logout that also routes back to /login (used by every screen's logout button). */
export function useLogout(): () => void {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])
}
