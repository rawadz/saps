import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import OfficialHeader from './OfficialHeader'
import { useInterval } from './useInterval'
import {
  ApiError,
  activateAdminUser,
  createAdminUser,
  deactivateAdminUser,
  describeApiError,
  getUsersList,
  type AdminRole,
  type CreateAdminUserInput,
  type UserAccountRole,
  type UserListItem,
  type UsersListPage,
} from './api'

type RoleFilter = '' | UserAccountRole

interface Msg {
  ok: boolean
  text: string
}

type DirState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: UsersListPage }
  | { phase: 'error'; message: string }

const PAGE_SIZE = 10

// Roles a super_admin may CREATE (excludes super_admin itself).
const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'guard', label: 'حارس' },
  { value: 'supervisor', label: 'مشرف' },
  { value: 'permit_officer', label: 'ضابط تصاريح' },
  { value: 'branch_head', label: 'رئيس فرع' },
  { value: 'hr', label: 'موارد بشرية' },
  { value: 'department_manager', label: 'مدير الإدارة' },
  { value: 'hr_head', label: 'رئيس الموارد البشرية' },
]

// Display labels for ALL account roles (incl. super_admin, which can appear in the list).
const ROLE_AR: Record<string, string> = {
  super_admin: 'مدير أعلى',
  branch_head: 'رئيس فرع',
  supervisor: 'مشرف',
  guard: 'حارس',
  permit_officer: 'ضابط تصاريح',
  hr: 'موارد بشرية',
  department_manager: 'مدير الإدارة',
  hr_head: 'رئيس الموارد البشرية',
}

function roleLabel(role: string): string {
  return ROLE_AR[role] ?? role
}

/** Client-side mirror of the backend password policy (≥12, ≥3 of 4 categories,
 *  must not contain the username). Returns an Arabic problem, or null if OK. */
function passwordIssue(pw: string, username: string): string | null {
  if (pw.length < 12) return 'كلمة المرور 12 حرفًا على الأقل.'
  let cats = 0
  if (/[a-z]/.test(pw)) cats++
  if (/[A-Z]/.test(pw)) cats++
  if (/[0-9]/.test(pw)) cats++
  if (/[^A-Za-z0-9]/.test(pw)) cats++
  if (cats < 3) {
    return 'تحتاج 3 من 4: حروف صغيرة، كبيرة، أرقام، رموز.'
  }
  const u = username.trim().toLowerCase()
  if (u.length >= 3 && pw.toLowerCase().includes(u)) {
    return 'يجب ألّا تحوي كلمة المرور اسم المستخدم.'
  }
  return null
}

function userError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'USERNAME_TAKEN') return 'اسم المستخدم مُستخدَم بالفعل.'
    if (err.code === 'INVALID_USERNAME') {
      return 'اسم المستخدم غير صالح (3 أحرف على الأقل).'
    }
    if (err.code === 'NOT_AUTHORIZED_TO_CREATE') {
      return 'لا تملك صلاحية إنشاء هذا الدور.'
    }
    if (err.code === 'NOT_AUTHORIZED_TO_ACTIVATE') {
      return 'لا تملك صلاحية تفعيل هذا المستخدم.'
    }
    if (err.code === 'NOT_AUTHORIZED_TO_LIST_USERS') {
      return 'إدارة المستخدمين متاحة للمدير الأعلى فقط.'
    }
    if (err.code === 'USER_NOT_FOUND') return 'المستخدم غير موجود.'
    if (err.code && err.code.startsWith('PASSWORD_')) {
      return 'كلمة المرور لا تحقّق السياسة (12 حرفًا، 3 فئات، غير شائعة، لا تحوي الاسم).'
    }
    if (err.status === 403) return 'لا تملك صلاحية هذا الإجراء.'
    if (err.status === 400) return 'بيانات غير صالحة — تحقّق من الحقول.'
  }
  return describeApiError(err)
}

/** Specific Arabic messages for the deactivate action's failure cases. */
function deactivateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'CANNOT_DEACTIVATE_SELF') {
      return 'لا يمكنك إلغاء تفعيل حسابك.'
    }
    if (err.code === 'NOT_AUTHORIZED_TO_DEACTIVATE') {
      return 'لا تملك صلاحية إلغاء تفعيل هذا المستخدم.'
    }
    if (err.code === 'CANNOT_DEACTIVATE_LAST_SUPER_ADMIN' || err.status === 409) {
      return 'لا يمكن إلغاء تفعيل آخر مدير أعلى نشط.'
    }
    if (err.code === 'USER_NOT_FOUND' || err.status === 404) {
      return 'المستخدم غير موجود.'
    }
    if (err.status === 403) return 'لا تملك صلاحية إلغاء تفعيل هذا المستخدم.'
  }
  return describeApiError(err)
}

export default function UsersScreen() {
  // ── Create ──
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminRole>('guard')
  const [fullName, setFullName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<Msg | null>(null)

  // ── Directory (live list from the backend) ──
  const [dir, setDir] = useState<DirState>({ phase: 'loading' })
  const [dirPage, setDirPage] = useState(1)
  const [fRole, setFRole] = useState<RoleFilter>('')
  const [qInput, setQInput] = useState('')
  const [qApplied, setQApplied] = useState('')

  // ── Activate by id ──
  const [activateId, setActivateId] = useState('')
  const [activating, setActivating] = useState(false)
  const [activateMsg, setActivateMsg] = useState<Msg | null>(null)

  // ── Deactivate (confirm-then-disable) ──
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string
    username: string
  } | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateMsg, setDeactivateMsg] = useState<Msg | null>(null)

  // Load a directory page. Overrides let a filter/search apply immediately, before
  // the corresponding state update has flushed.
  async function loadDir(
    page: number,
    roleOverride?: RoleFilter,
    qOverride?: string,
    silent = false,
  ) {
    const r = roleOverride ?? fRole
    const q = qOverride ?? qApplied
    setDirPage(page)
    if (!silent) setDir({ phase: 'loading' })
    try {
      const data = await getUsersList(
        page,
        PAGE_SIZE,
        r || undefined,
        q || undefined,
      )
      setDir({ phase: 'ok', data })
    } catch (err) {
      // Silent auto-refresh keeps the current data on failure (retry next tick).
      if (!silent) setDir({ phase: 'error', message: userError(err) })
    }
  }

  // Initial load on mount.
  useEffect(() => {
    void loadDir(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent auto-refresh every 10s — keeps the current page, role filter, search and
  // selection; no loading flicker, failures ignored until the next tick.
  useInterval(() => {
    void loadDir(dirPage, undefined, undefined, true)
  }, 10000)

  function applyRole(r: RoleFilter) {
    setFRole(r)
    void loadDir(1, r)
  }

  function applySearch() {
    const q = qInput.trim()
    setQApplied(q)
    void loadDir(1, undefined, q)
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      applySearch()
    }
  }

  function selectUser(u: UserListItem) {
    setActivateId(u.id)
    setActivateMsg(null)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreateMsg(null)
    if (username.trim().length < 3) {
      setCreateMsg({ ok: false, text: 'اسم المستخدم 3 أحرف على الأقل.' })
      return
    }
    const pwIssue = passwordIssue(password, username)
    if (pwIssue) {
      setCreateMsg({ ok: false, text: pwIssue })
      return
    }
    setCreating(true)
    try {
      const input: CreateAdminUserInput = {
        username: username.trim(),
        role,
        password,
      }
      if (fullName.trim()) input.fullName = fullName.trim()
      const res = await createAdminUser(input)
      setCreateMsg({
        ok: true,
        text: `تم إنشاء المستخدم: ${username.trim()} (${ROLE_AR[role]}). المعرّف مُلئ تلقائيًا في حقل التفعيل بالأسفل.`,
      })
      // The new account is INACTIVE; pre-fill its id into the activation field.
      setActivateId(res.id)
      setUsername('')
      setPassword('')
      setFullName('')
      // The new user is newest → it appears on page 1 (sorted newest first).
      void loadDir(1)
    } catch (err) {
      setCreateMsg({ ok: false, text: userError(err) })
    } finally {
      setCreating(false)
    }
  }

  async function handleActivate() {
    setActivateMsg(null)
    const id = activateId.trim()
    if (!id) {
      setActivateMsg({ ok: false, text: 'اختر مستخدمًا من القائمة أو أدخل معرّفه (UUID).' })
      return
    }
    setActivating(true)
    try {
      await activateAdminUser(id)
      setActivateMsg({ ok: true, text: 'تم تفعيل المستخدم.' })
      // Reflect the change: reload the current directory page.
      void loadDir(dirPage)
    } catch (err) {
      setActivateMsg({ ok: false, text: userError(err) })
    } finally {
      setActivating(false)
    }
  }

  function requestDeactivate(u: UserListItem) {
    setDeactivateMsg(null)
    setDeactivateTarget({ id: u.id, username: u.username })
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await deactivateAdminUser(deactivateTarget.id)
      setDeactivateMsg({ ok: true, text: 'تم إلغاء تفعيل المستخدم.' })
      setDeactivateTarget(null)
      void loadDir(dirPage) // reflect the flipped status
    } catch (err) {
      setDeactivateMsg({ ok: false, text: deactivateError(err) })
      setDeactivateTarget(null)
    } finally {
      setDeactivating(false)
    }
  }

  const totalPages =
    dir.phase === 'ok' ? Math.max(1, Math.ceil(dir.data.total / PAGE_SIZE)) : 1

  return (
    <div className="app">
      <main className="card employees-card">
        <OfficialHeader />
        <p className="subtitle">إدارة المستخدمين</p>

        {/* ── Create an admin user ──────────────────────────────────── */}
        <form className="form" onSubmit={handleCreate}>
          <h2 className="emp-heading">إنشاء مستخدم إداري</h2>

          <label className="field">
            <span className="label">اسم المستخدم *</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">كلمة المرور *</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={creating}
            />
            <span className="field-hint">
              12 حرفًا على الأقل، و3 من 4: حروف صغيرة/كبيرة/أرقام/رموز.
            </span>
          </label>

          <label className="field">
            <span className="label">الدور *</span>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              disabled={creating}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">الاسم الكامل (اختياري)</span>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={creating}
            />
          </label>

          {createMsg && (
            <div
              className={`test-result ${createMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {createMsg.text}
            </div>
          )}

          <button className="btn btn-scan" type="submit" disabled={creating}>
            {creating ? 'جارٍ الإنشاء…' : 'إنشاء المستخدم'}
          </button>
        </form>

        {/* ── User directory (live, from the backend) ───────────────── */}
        <div className="emp-section">
          <h2 className="emp-heading">قائمة المستخدمين</h2>

          <div className="log-filters">
            <label className="field">
              <span className="label">الدور</span>
              <select
                className="input"
                value={fRole}
                onChange={(e) => applyRole(e.target.value as RoleFilter)}
                disabled={dir.phase === 'loading'}
              >
                <option value="">الكل</option>
                <option value="super_admin">مدير أعلى</option>
                <option value="branch_head">رئيس فرع</option>
                <option value="supervisor">مشرف</option>
                <option value="guard">حارس</option>
                <option value="permit_officer">ضابط تصاريح</option>
                <option value="hr">موارد بشرية</option>
                <option value="department_manager">مدير الإدارة</option>
                <option value="hr_head">رئيس الموارد البشرية</option>
              </select>
            </label>
            <label className="field">
              <span className="label">بحث باسم المستخدم</span>
              <input
                className="input"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="اكتب اسمًا ثم اضغط بحث"
                autoComplete="off"
              />
            </label>
          </div>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={applySearch}
            disabled={dir.phase === 'loading'}
          >
            {dir.phase === 'loading' ? 'جارٍ التحميل…' : 'بحث'}
          </button>

          {deactivateTarget && (
            <div className="emp-section">
              <p className="welcome">
                هل أنت متأكد من إلغاء تفعيل المستخدم{' '}
                <span>{deactivateTarget.username}</span>؟
              </p>
              <div className="emp-actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void confirmDeactivate()}
                  disabled={deactivating}
                >
                  {deactivating ? 'جارٍ الإلغاء…' : 'تأكيد إلغاء التفعيل'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeactivateTarget(null)}
                  disabled={deactivating}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {deactivateMsg && (
            <div
              className={`test-result ${deactivateMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {deactivateMsg.text}
            </div>
          )}

          {dir.phase === 'loading' && (
            <p className="log-empty">جارٍ تحميل القائمة…</p>
          )}

          {dir.phase === 'error' && (
            <div className="test-result test-error">{dir.message}</div>
          )}

          {dir.phase === 'ok' && dir.data.items.length === 0 && (
            <p className="log-empty">لا يوجد مستخدمون مطابقون.</p>
          )}

          {dir.phase === 'ok' && dir.data.items.length > 0 && (
            <>
              <div className="log-list">
                {dir.data.items.map((u) => (
                  <div
                    key={u.id}
                    role="button"
                    tabIndex={0}
                    className={`log-row emp-dir-row ${
                      u.id === activateId ? 'emp-dir-selected' : ''
                    }`}
                    onClick={() => selectUser(u)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectUser(u)
                      }
                    }}
                  >
                    <div className="log-row-head">
                      <span className="log-name">
                        {u.username}
                      </span>
                      <span
                        className={`badge ${
                          u.isAccountActivated ? 'badge-ok' : 'badge-pending'
                        }`}
                      >
                        {u.isAccountActivated ? 'مفعّل' : 'غير مفعّل'}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      {roleLabel(u.role)}
                      {u.fullName ? ` • ${u.fullName}` : ''}
                      {u.mustChangePassword ? ' • يجب تغيير كلمة المرور' : ''}
                    </div>
                    {u.isAccountActivated && (
                      <button
                        type="button"
                        className="row-deactivate"
                        onClick={(e) => {
                          e.stopPropagation()
                          requestDeactivate(u)
                        }}
                        disabled={deactivating}
                      >
                        إلغاء التفعيل
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="log-pager">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void loadDir(dirPage - 1)}
                  disabled={dirPage <= 1 || dir.phase !== 'ok'}
                >
                  السابق
                </button>
                <span>
                  صفحة {dirPage} من {totalPages} — الإجمالي {dir.data.total}
                </span>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void loadDir(dirPage + 1)}
                  disabled={dirPage >= totalPages}
                >
                  التالي
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Activate by id (click an inactive user above fills it) ─── */}
        <div className="emp-section">
          <h2 className="emp-heading">تفعيل مستخدم بالمعرّف</h2>
          <label className="field">
            <span className="label">معرّف المستخدم (UUID)</span>
            <input
              className="input"
              value={activateId}
              onChange={(e) => setActivateId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
              disabled={activating}
            />
          </label>

          {activateMsg && (
            <div
              className={`test-result ${activateMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {activateMsg.text}
            </div>
          )}

          <button
            className="btn btn-secondary"
            type="button"
            onClick={handleActivate}
            disabled={activating || activateId.trim().length === 0}
          >
            {activating ? 'جارٍ التفعيل…' : 'تفعيل'}
          </button>
        </div>
      </main>
    </div>
  )
}
