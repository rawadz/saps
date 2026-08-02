import { useEffect } from 'react'
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import DashboardScreen from './DashboardScreen'
import EmployeesScreen from './EmployeesScreen'
import GatesScreen from './GatesScreen'
import LoginScreen from './LoginScreen'
import MyBarcodeScreen from './MyBarcodeScreen'
import ReportsScreen from './ReportsScreen'
import ScanScreen from './ScanScreen'
import UsersScreen from './UsersScreen'
import VehiclePermitsScreen from './VehiclePermitsScreen'
import VisitorPermitsScreen from './VisitorPermitsScreen'
import { setUnauthorizedHandler } from './api'
import {
  DASHBOARD_ROLES,
  EMPLOYEE_ROLES,
  GATES_ROLES,
  PERMIT_ROLES,
  REPORTS_ROLES,
  SCAN_ROLES,
  USERS_ROLES,
  roleHome,
  useAuth,
  useLogout,
} from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'

// The dashboard hub (admins) / role landing. Guard + employee are redirected to their
// single screen; the SectionKey values map 1:1 to the route paths (navigate('/'+key)).
function RoleHome() {
  const { auth } = useAuth()
  const navigate = useNavigate()
  const logout = useLogout()
  if (auth!.role === 'guard') return <Navigate to="/scan" replace />
  if (auth!.role === 'employee') return <Navigate to="/my-barcode" replace />
  return (
    <DashboardScreen
      role={auth!.role!}
      onSelect={(key) => navigate('/' + key)}
      onLogout={logout}
    />
  )
}

// /login: if already authenticated, bounce to the role home instead of showing the form.
function LoginRoute() {
  const { auth } = useAuth()
  return auth ? <Navigate to={roleHome(auth.role)} replace /> : <LoginScreen />
}

// Layout route for the admin sections: renders the floating back-to-dashboard button
// (only for dashboard roles) around the section <Outlet/>. /my-barcode & /login sit
// OUTSIDE it, so employees / logged-out users never see the admin chrome.
function AdminSectionChrome() {
  const { auth } = useAuth()
  const navigate = useNavigate()
  const showBack = !!auth?.role && DASHBOARD_ROLES.includes(auth.role)
  return (
    <>
      {showBack && (
        <button
          className="dash-back"
          type="button"
          onClick={() => navigate('/')}
        >
          ↩ لوحة التحكّم
        </button>
      )}
      <Outlet />
    </>
  )
}

/**
 * Bridges api.ts's auth-expiry signal (401 / no session) to navigation: on fire, clears
 * the session and routes to /login (remembering the current path). Reads window.location
 * at fire-time to avoid a stale closure. Rendered inside Router + AuthProvider.
 */
export function AuthExpiryBridge() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout()
      const from = window.location.pathname + window.location.search
      navigate('/login', { replace: true, state: { from } })
    })
    return () => setUnauthorizedHandler(null)
  }, [logout, navigate])
  return null
}

export function AppRoutes() {
  const logout = useLogout()
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RoleHome />
          </RequireAuth>
        }
      />
      <Route element={<AdminSectionChrome />}>
        <Route
          path="/scan"
          element={
            <RequireAuth roles={SCAN_ROLES}>
              <ScanScreen onLogout={logout} />
            </RequireAuth>
          }
        />
        <Route
          path="/employees"
          element={
            <RequireAuth roles={EMPLOYEE_ROLES}>
              <EmployeesScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/visitor-permits"
          element={
            <RequireAuth roles={PERMIT_ROLES}>
              <VisitorPermitsScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/vehicle-permits"
          element={
            <RequireAuth roles={PERMIT_ROLES}>
              <VehiclePermitsScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth roles={REPORTS_ROLES}>
              <ReportsScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth roles={USERS_ROLES}>
              <UsersScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/gates"
          element={
            <RequireAuth roles={GATES_ROLES}>
              <GatesScreen />
            </RequireAuth>
          }
        />
      </Route>
      <Route
        path="/my-barcode"
        element={
          <RequireAuth roles={['employee']}>
            <MyBarcodeScreen onLogout={logout} />
          </RequireAuth>
        }
      />
      {/* Unknown path → role home (or /login if unauthenticated). */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <RoleHome />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
