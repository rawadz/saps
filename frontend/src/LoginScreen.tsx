import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import OfficialHeader from './OfficialHeader'
import { ApiError, adminLogin, decodeTokenRole, employeeLogin } from './api'
import { roleHome, useAuth } from './auth/AuthContext'

type Mode = 'admin' | 'employee'

const DEVICE_ID_KEY = 'esaps.deviceId'
const SELF_ID_PATTERN = /^[A-Za-z0-9-]{3,32}$/

// Phase 1: employees are QR-card holders only and do NOT log in. The admin/employee
// tab switch is hidden and the screen is locked to admin login; the employee code path
// is kept intact for re-enabling later (flip this to true).
const EMPLOYEE_LOGIN_ENABLED = false

/** A stable per-session device id (anchors the backend's single-device rule). */
function getDeviceId(): string {
  const existing = sessionStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
  sessionStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

/** Map a backend failure to a clear Arabic message (never leaking which field failed). */
function toArabicError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'تعذّر الاتصال بالخادم. تأكّد من تشغيل الخلفية.'
    if (err.status === 429)
      return 'محاولات كثيرة جدًّا — الرجاء المحاولة بعد قليل.'
    if (err.code === 'ACCOUNT_NOT_ACTIVATED' || err.code === 'ACCOUNT_NOT_ACTIVE')
      return 'الحساب غير مُفعّل.'
    if (err.code === 'INVALID_EMPLOYEE_ID') return 'الرقم الوظيفي غير صالح.'
    if (err.status === 401) return 'بيانات الدخول غير صحيحة.'
    if (err.status === 400) return 'بيانات غير صالحة — تحقّق من الحقول.'
    return 'تعذّر تسجيل الدخول. حاول مرة أخرى.'
  }
  return 'حدث خطأ غير متوقّع.'
}

export default function LoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selfId, setSelfId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const accessToken =
        mode === 'admin'
          ? (
              await adminLogin({
                username: username.trim(),
                password,
                deviceId: getDeviceId(),
              })
            ).accessToken
          : (await employeeLogin(selfId.trim())).accessToken
      const role = decodeTokenRole(accessToken)
      login({ accessToken, role })
      // Return to the page the user was bounced from (if any), else the role home.
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? roleHome(role), { replace: true })
    } catch (err) {
      setError(toArabicError(err))
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    !loading &&
    (mode === 'admin'
      ? username.trim().length > 0 && password.length > 0
      : SELF_ID_PATTERN.test(selfId.trim()))

  return (
    <div className="app">
      <main className="card login-card">
        <OfficialHeader />
        <p className="subtitle">تسجيل الدخول</p>

        {/* Employee login is disabled this phase: the admin/employee tab switch is
            hidden and the screen is locked to admin login (code kept for re-enabling). */}
        {EMPLOYEE_LOGIN_ENABLED && (
          <div className="tabs" role="tablist">
            <button
              type="button"
              className={`tab ${mode === 'admin' ? 'tab-active' : ''}`}
              onClick={() => switchMode('admin')}
            >
              دخول إداري
            </button>
            <button
              type="button"
              className={`tab ${mode === 'employee' ? 'tab-active' : ''}`}
              onClick={() => switchMode('employee')}
            >
              دخول موظف
            </button>
          </div>
        )}

        <form className="form" onSubmit={handleSubmit}>
          {mode === 'admin' ? (
            <>
              <label className="field">
                <span className="label">اسم المستخدم</span>
                <input
                  className="input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </label>
              <label className="field">
                <span className="label">كلمة المرور</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span className="label">الرقم الوظيفي</span>
              <input
                className="input"
                type="text"
                value={selfId}
                onChange={(e) => setSelfId(e.target.value)}
                placeholder="EMP-10234"
                autoComplete="off"
                disabled={loading}
              />
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="btn" type="submit" disabled={!canSubmit}>
            {loading ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>
      </main>
    </div>
  )
}
