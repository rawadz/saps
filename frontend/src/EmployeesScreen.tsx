import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import OfficialHeader from './OfficialHeader'
import EmployeeImport from './EmployeeImport'
import BarcodeActions from './BarcodeActions'
import EmployeeGatesPanel from './EmployeeGatesPanel'
import { useInterval } from './useInterval'
import {
  ApiError,
  apiPostAuth,
  describeApiError,
  exportEmployeesBarcodes,
  getEmployeeBarcode,
  getEmployeesList,
  getStoredSession,
  recordServiceExit,
  restoreEmployeeService,
  type EmployeeBarcodeView,
  type EmployeeDisplayStatus,
  type EmployeeListItem,
  type EmployeesListPage,
  type ServiceExitStatus,
} from './api'

type PersonnelType = 'civilian' | 'military'
type ActionKind = 'activate' | 'ban' | 'unban'
type ServiceKind = 'service-exit' | 'service-restore'
// Shared busy flag across every per-employee action so they never run concurrently.
type BusyKind = ActionKind | ServiceKind | ''
type StatusFilter = '' | EmployeeDisplayStatus

// Arabic labels for the exit statuses (select options + success message).
const SERVICE_STATUS_AR: Record<ServiceExitStatus, string> = {
  transferred: 'منقول من الإدارة',
  discharged: 'مسرّح من الخدمة',
  contract_ended: 'منتهي التعاقد',
}

interface Msg {
  ok: boolean
  text: string
}

type DirState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: EmployeesListPage }
  | { phase: 'error'; message: string }

// Same shape the backend re-validates (CreateEmployeeDto): 3–32 letters/digits/hyphen.
const ID_RE = /^[A-Za-z0-9-]{3,32}$/
// Lenient phone shape, mirroring the backend DTO (digits, +, (), -, spaces).
const PHONE_RE = /^[0-9+()\-\s]{6,20}$/
const PAGE_SIZE = 10

/** Map an employee-endpoint failure to a clear Arabic message. */
function employeeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 || err.code === 'EMPLOYEE_ALREADY_EXISTS') {
      return 'هذا الرقم الوظيفي مُستخدَم بالفعل.'
    }
    if (err.code === 'EMPLOYEE_NOT_FOUND') return 'الموظف غير موجود.'
    if (err.code === 'INVALID_EMPLOYEE_ID' || err.code === 'INVALID_MILITARY_ID') {
      return 'رقم غير صالح (3–32: أحرف لاتينية/أرقام/شَرطة).'
    }
    if (err.status === 403) return 'لا تملك صلاحية تنفيذ هذا الإجراء.'
  }
  return describeApiError(err)
}

/** Map a service-exit/restore failure to Arabic (service-specific codes first). */
function serviceError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'DISCHARGED_REQUIRES_MILITARY':
        return 'التسريح من الخدمة متاح للعسكريين فقط.'
      case 'CONTRACT_ENDED_REQUIRES_CIVILIAN':
        return 'انتهاء التعاقد متاح للمدنيين فقط.'
      case 'EXIT_DATE_IN_FUTURE':
        return 'لا يمكن أن يكون تاريخ الخروج مستقبليًّا.'
      case 'INVALID_EXIT_DATE':
        return 'تاريخ الخروج غير صالح.'
      case 'INVALID_SERVICE_STATUS':
        return 'حالة الخدمة غير صالحة.'
      case 'NOT_AUTHORIZED_FOR_SERVICE_EXIT':
        return 'لا تملك صلاحية تسجيل حالة الخدمة.'
    }
  }
  return employeeError(err)
}

function statusLabel(s: EmployeeDisplayStatus): string {
  return s === 'active' ? 'مفعّل' : s === 'banned' ? 'محظور' : 'غير مفعّل'
}

// Reuse the existing badge variants: green / red / grey.
function statusBadgeClass(s: EmployeeDisplayStatus): string {
  return s === 'active' ? 'badge-ok' : s === 'banned' ? 'badge-error' : 'badge-pending'
}

function personnelLabel(t: PersonnelType): string {
  return t === 'military' ? 'عسكري' : 'مدني'
}

export default function EmployeesScreen() {
  // ── Create form ──
  const [selfId, setSelfId] = useState('')
  const [fullName, setFullName] = useState('')
  const [personnelType, setPersonnelType] = useState<PersonnelType>('civilian')
  const [militaryId, setMilitaryId] = useState('')
  const [commandDepartment, setCommandDepartment] = useState('')
  const [branch, setBranch] = useState('')
  const [rank, setRank] = useState('')
  const [currentJobTitle, setCurrentJobTitle] = useState('')
  const [priority, setPriority] = useState('') // درجة الأهميّة A/B/C
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<Msg | null>(null)

  // ── Directory (live list from the backend) ──
  const [dir, setDir] = useState<DirState>({ phase: 'loading' })
  const [dirPage, setDirPage] = useState(1)
  const [fStatus, setFStatus] = useState<StatusFilter>('')
  const [qInput, setQInput] = useState('')
  const [qApplied, setQApplied] = useState('')

  // ── Barcode Excel export (Phase 3-b) ──
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<Msg | null>(null)

  // ── Actions (by selfId) ──
  const [actionSelfId, setActionSelfId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<BusyKind>('')
  const [actionMsg, setActionMsg] = useState<Msg | null>(null)

  // ── Service exit / restore (same target employee, its own inputs + message) ──
  const [serviceStatus, setServiceStatus] =
    useState<ServiceExitStatus>('transferred')
  const [exitDate, setExitDate] = useState('')
  const [serviceNote, setServiceNote] = useState('')
  const [serviceMsg, setServiceMsg] = useState<Msg | null>(null)

  // ── Barcode view/issue (Phase 3-a) — for the currently targeted employee ──
  const [barcodeView, setBarcodeView] = useState<EmployeeBarcodeView | null>(
    null,
  )
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeErr, setBarcodeErr] = useState('')

  // Load a directory page. Overrides let a tab/search apply its value immediately,
  // before the corresponding state update has flushed.
  async function loadDir(
    page: number,
    statusOverride?: StatusFilter,
    qOverride?: string,
    silent = false,
  ) {
    const status = statusOverride ?? fStatus
    const q = qOverride ?? qApplied
    setDirPage(page)
    if (!silent) setDir({ phase: 'loading' })
    try {
      const data = await getEmployeesList(
        page,
        PAGE_SIZE,
        status || undefined,
        q || undefined,
      )
      setDir({ phase: 'ok', data })
    } catch (err) {
      // Silent auto-refresh keeps the current data on failure (retry next tick).
      if (!silent) setDir({ phase: 'error', message: employeeError(err) })
    }
  }

  // Initial load on mount.
  useEffect(() => {
    void loadDir(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent auto-refresh every 10s — keeps the current page, filters, search and
  // selection; no loading flicker, failures ignored until the next tick.
  useInterval(() => {
    void loadDir(dirPage, undefined, undefined, true)
  }, 10000)

  // Clear any shown barcode whenever the targeted employee changes, so a previous
  // employee's barcode never lingers under a newly selected one.
  useEffect(() => {
    setBarcodeView(null)
    setBarcodeErr('')
  }, [actionSelfId])

  function applyStatus(s: StatusFilter) {
    setFStatus(s)
    void loadDir(1, s)
  }

  function applySearch() {
    const q = qInput.trim()
    setQApplied(q)
    void loadDir(1, undefined, q)
  }

  // Export every employee matching the CURRENTLY-APPLIED filters (status + search) to
  // an .xlsx of name + branch + barcode. Mirrors ReportsScreen.handleExport: the
  // barcode comes from the dedicated export route (never the directory list), and
  // SheetJS is lazy-loaded only on demand.
  async function handleExportBarcodes() {
    setExportMsg(null)
    setExporting(true)
    try {
      const rows = await exportEmployeesBarcodes(
        fStatus || undefined,
        qApplied || undefined,
      )
      if (rows.length === 0) {
        setExportMsg({ ok: false, text: 'لا يوجد موظفون للتصدير.' })
        return
      }

      const XLSX = await import('xlsx')
      const header = ['الاسم', 'الفرع', 'الباركود']
      const body = rows.map((r) => [
        r.fullName,
        r.branch ?? '',
        r.barcodeToken ?? '', // not-yet-activated employee → empty cell
      ])

      const ws = XLSX.utils.aoa_to_sheet([header, ...body])
      ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 48 }]
      // Right-to-left sheet view for Arabic ('!views' is outside the typed surface).
      const rtlWs = ws as typeof ws & { '!views'?: Array<{ RTL: boolean }> }
      rtlWs['!views'] = [{ RTL: true }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'باركود الموظفين')

      const now = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
      XLSX.writeFile(wb, `باركود_الموظفين_${stamp}.xlsx`)

      setExportMsg({ ok: true, text: `تم تصدير ${rows.length} موظف.` })
    } catch (err) {
      // Do not download a partial file — report and bail.
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.code === 'FORBIDDEN_BARCODE_EXPORT')
      ) {
        setExportMsg({ ok: false, text: 'لا تملك صلاحية للتصدير.' })
      } else {
        setExportMsg({ ok: false, text: `تعذّر التصدير: ${employeeError(err)}` })
      }
    } finally {
      setExporting(false)
    }
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      applySearch()
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreateMsg(null)
    const id = selfId.trim()
    const name = fullName.trim()
    if (!ID_RE.test(id)) {
      setCreateMsg({
        ok: false,
        text: 'الرقم الوظيفي غير صالح (3–32: أحرف لاتينية/أرقام/شَرطة).',
      })
      return
    }
    if (name.length === 0) {
      setCreateMsg({ ok: false, text: 'الاسم الكامل مطلوب.' })
      return
    }
    if (!PHONE_RE.test(phone.trim())) {
      setCreateMsg({
        ok: false,
        text: 'رقم الهاتف غير صالح (6–20: أرقام و + ( ) - ومسافات).',
      })
      return
    }
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        selfId: id,
        fullName: name,
        personnelType,
        phone: phone.trim(),
      }
      const add = (key: string, value: string) => {
        if (value.trim()) body[key] = value.trim()
      }
      add('militaryId', militaryId)
      add('commandDepartment', commandDepartment)
      add('branch', branch)
      add('rank', rank)
      add('currentJobTitle', currentJobTitle)
      add('priority', priority)

      await apiPostAuth('/accounts/employees', body)
      setCreateMsg({
        ok: true,
        text: `تم إنشاء الموظف: ${name} — ${id}. الحالة: قيد التفعيل.`,
      })
      setActionSelfId(id) // target the new employee in the actions panel
      // Clear the form (keep personnelType for the next entry).
      setSelfId('')
      setFullName('')
      setMilitaryId('')
      setCommandDepartment('')
      setBranch('')
      setRank('')
      setCurrentJobTitle('')
      setPriority('')
      setPhone('')
      // The new employee is newest → it appears on page 1 (sorted newest first).
      void loadDir(1)
    } catch (err) {
      setCreateMsg({ ok: false, text: employeeError(err) })
    } finally {
      setCreating(false)
    }
  }

  async function runAction(kind: ActionKind) {
    setActionMsg(null)
    const id = actionSelfId.trim()
    if (!ID_RE.test(id)) {
      setActionMsg({ ok: false, text: 'اختر موظفًا من القائمة أو أدخل رقمًا وظيفيًّا صالحًا.' })
      return
    }
    if (kind === 'ban' && reason.trim().length < 3) {
      setActionMsg({ ok: false, text: 'سبب الحظر مطلوب (3 أحرف على الأقل).' })
      return
    }
    setBusy(kind)
    try {
      const enc = encodeURIComponent(id)
      if (kind === 'activate') {
        await apiPostAuth(`/accounts/employees/${enc}/activate`, {})
        setActionMsg({ ok: true, text: `تم تفعيل ${id} وإنشاء باركوده.` })
      } else if (kind === 'ban') {
        await apiPostAuth(`/accounts/employees/${enc}/ban`, {
          reason: reason.trim(),
        })
        setActionMsg({ ok: true, text: `تم حظر ${id}.` })
      } else {
        await apiPostAuth(
          `/accounts/employees/${enc}/unban`,
          reason.trim() ? { reason: reason.trim() } : {},
        )
        setActionMsg({ ok: true, text: `تم إلغاء حظر ${id}.` })
      }
      // Reflect the change: reload the current directory page.
      void loadDir(dirPage)
    } catch (err) {
      setActionMsg({ ok: false, text: employeeError(err) })
    } finally {
      setBusy('')
    }
  }

  // Record an exit from service. Type matching + future-date are enforced by the
  // backend; we surface its stable code as a precise Arabic message.
  async function runServiceExit() {
    setServiceMsg(null)
    const id = actionSelfId.trim()
    if (!ID_RE.test(id)) {
      setServiceMsg({
        ok: false,
        text: 'اختر موظفًا من القائمة أو أدخل رقمًا وظيفيًّا صالحًا.',
      })
      return
    }
    if (!exitDate) {
      setServiceMsg({ ok: false, text: 'تاريخ الخروج مطلوب.' })
      return
    }
    setBusy('service-exit')
    try {
      await recordServiceExit(id, {
        serviceStatus,
        exitDate,
        note: serviceNote.trim() || undefined,
      })
      setServiceMsg({
        ok: true,
        text: `تم تسجيل حالة الخروج (${SERVICE_STATUS_AR[serviceStatus]}) للموظف ${id}.`,
      })
      setServiceNote('')
      void loadDir(dirPage)
    } catch (err) {
      setServiceMsg({ ok: false, text: serviceError(err) })
    } finally {
      setBusy('')
    }
  }

  // Return the employee to active service (corrects a mistaken exit).
  async function runServiceRestore() {
    setServiceMsg(null)
    const id = actionSelfId.trim()
    if (!ID_RE.test(id)) {
      setServiceMsg({
        ok: false,
        text: 'اختر موظفًا من القائمة أو أدخل رقمًا وظيفيًّا صالحًا.',
      })
      return
    }
    setBusy('service-restore')
    try {
      await restoreEmployeeService(id)
      setServiceMsg({ ok: true, text: `تمت إعادة الموظف ${id} إلى الخدمة.` })
      void loadDir(dirPage)
    } catch (err) {
      setServiceMsg({ ok: false, text: serviceError(err) })
    } finally {
      setBusy('')
    }
  }

  function selectEmployee(emp: EmployeeListItem) {
    setActionSelfId(emp.selfId)
    setActionMsg(null)
    setServiceMsg(null)
  }

  // Fetch the targeted employee's barcode (admin route). A not-yet-activated
  // employee resolves with barcodeToken=null — shown as a message, not an error.
  async function showBarcode() {
    setBarcodeErr('')
    const id = actionSelfId.trim()
    if (!ID_RE.test(id)) {
      setBarcodeErr('اختر موظفًا من القائمة أو أدخل رقمًا وظيفيًّا صالحًا.')
      return
    }
    setBarcodeLoading(true)
    try {
      const view = await getEmployeeBarcode(id)
      setBarcodeView(view)
    } catch (err) {
      setBarcodeView(null)
      setBarcodeErr(employeeError(err))
    } finally {
      setBarcodeLoading(false)
    }
  }

  // Current user's role — gate-assignment is leadership-only (super_admin/branch_head).
  const role = getStoredSession()?.role ?? null
  const busyAny = busy !== ''
  const totalPages =
    dir.phase === 'ok' ? Math.max(1, Math.ceil(dir.data.total / PAGE_SIZE)) : 1

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: '', label: 'الكل' },
    { value: 'active', label: 'مفعّل' },
    { value: 'banned', label: 'محظور' },
    { value: 'inactive', label: 'غير مفعّل' },
  ]

  return (
    <div className="app">
      <main className="card employees-card">
        <OfficialHeader />
        <p className="subtitle">إدارة الموظفين</p>

        {/* ── Create a new employee ─────────────────────────────────── */}
        <form className="form" onSubmit={handleCreate}>
          <h2 className="emp-heading">إنشاء موظف جديد</h2>

          <label className="field">
            <span className="label">الرقم الوظيفي *</span>
            <input
              className="input"
              value={selfId}
              onChange={(e) => setSelfId(e.target.value)}
              placeholder="EMP-20002"
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الاسم الكامل *</span>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">النوع *</span>
            <select
              className="input"
              value={personnelType}
              onChange={(e) => setPersonnelType(e.target.value as PersonnelType)}
              disabled={creating}
            >
              <option value="civilian">مدني</option>
              <option value="military">عسكري</option>
            </select>
          </label>

          <label className="field">
            <span className="label">الرقم العسكري (اختياري)</span>
            <input
              className="input"
              value={militaryId}
              onChange={(e) => setMilitaryId(e.target.value)}
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">رقم الهاتف *</span>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+963 9XX XXX XXX"
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الإدارة / القسم (اختياري)</span>
            <input
              className="input"
              value={commandDepartment}
              onChange={(e) => setCommandDepartment(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الفرع (اختياري)</span>
            <input
              className="input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الرتبة (اختياري)</span>
            <input
              className="input"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">المسمى الوظيفي (اختياري)</span>
            <input
              className="input"
              value={currentJobTitle}
              onChange={(e) => setCurrentJobTitle(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">درجة الأهمية (اختياري)</span>
            <select
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={creating}
            >
              <option value="">— غير محددة —</option>
              <option value="A">A — رئيس فرع / مدير إدارة</option>
              <option value="B">B — مسؤول قسم / مسؤول مكتب</option>
              <option value="C">C — موظف / منتسب عادي</option>
            </select>
          </label>

          {createMsg && (
            <div
              className={`test-result ${createMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {createMsg.text}
            </div>
          )}

          <button
            className="btn btn-scan"
            type="submit"
            disabled={
              creating ||
              selfId.trim().length === 0 ||
              fullName.trim().length === 0
            }
          >
            {creating ? 'جارٍ الإنشاء…' : 'إنشاء الموظف'}
          </button>
        </form>

        {/* ── Bulk import from Excel ────────────────────────────────── */}
        <EmployeeImport onChanged={() => void loadDir(1)} />

        {/* ── Employee directory (live, from the backend) ───────────── */}
        <div className="emp-section">
          <h2 className="emp-heading">قائمة الموظفين</h2>

          <div className="owner-toggle">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value || 'all'}
                type="button"
                className={`tab ${fStatus === t.value ? 'tab-active' : ''}`}
                onClick={() => applyStatus(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="log-filters">
            <label className="field">
              <span className="label">بحث بالاسم أو الرقم الوظيفي</span>
              <input
                className="input"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="اكتب اسماً (بأي ترتيب) أو رقماً وظيفياً ثم اضغط بحث"
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

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void handleExportBarcodes()}
            disabled={exporting || dir.phase === 'loading'}
          >
            {exporting ? 'جارٍ التصدير…' : 'تصدير Excel'}
          </button>

          {exportMsg && (
            <div
              className={`test-result ${exportMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {exportMsg.text}
            </div>
          )}

          {dir.phase === 'loading' && (
            <p className="log-empty">جارٍ تحميل القائمة…</p>
          )}

          {dir.phase === 'error' && (
            <div className="test-result test-error">{dir.message}</div>
          )}

          {dir.phase === 'ok' && dir.data.items.length === 0 && (
            <p className="log-empty">لا يوجد موظفون مطابقون.</p>
          )}

          {dir.phase === 'ok' && dir.data.items.length > 0 && (
            <>
              <div className="log-list">
                {dir.data.items.map((emp) => (
                  <div
                    key={emp.selfId}
                    role="button"
                    tabIndex={0}
                    className={`log-row emp-dir-row ${
                      emp.selfId === actionSelfId ? 'emp-dir-selected' : ''
                    }`}
                    onClick={() => selectEmployee(emp)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectEmployee(emp)
                      }
                    }}
                  >
                    <div className="log-row-head">
                      <span className="log-name">{emp.fullName}</span>
                      <span
                        className={`badge ${statusBadgeClass(emp.displayStatus)}`}
                      >
                        {statusLabel(emp.displayStatus)}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      <span>{emp.selfId}</span>
                      {` • ${personnelLabel(emp.personnelType)}`}
                      {emp.commandDepartment ? ` • ${emp.commandDepartment}` : ''}
                      {emp.branch ? ` • ${emp.branch}` : ''}
                    </div>
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

        {/* ── Actions by selfId (click a row above to fill it) ──────── */}
        <div className="emp-section">
          <h2 className="emp-heading">إجراءات على موظف</h2>

          <label className="field">
            <span className="label">الرقم الوظيفي</span>
            <input
              className="input"
              value={actionSelfId}
              onChange={(e) => setActionSelfId(e.target.value)}
              placeholder="EMP-20002"
              autoComplete="off"
              disabled={busyAny}
            />
          </label>

          <label className="field">
            <span className="label">سبب الحظر (مطلوب عند الحظر)</span>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busyAny}
            />
          </label>

          {actionMsg && (
            <div
              className={`test-result ${actionMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {actionMsg.text}
            </div>
          )}

          <div className="emp-actions">
            <button
              type="button"
              className="btn"
              disabled={busyAny}
              onClick={() => runAction('activate')}
            >
              {busy === 'activate' ? '…' : 'تفعيل'}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busyAny}
              onClick={() => runAction('ban')}
            >
              {busy === 'ban' ? '…' : 'حظر'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyAny}
              onClick={() => runAction('unban')}
            >
              {busy === 'unban' ? '…' : 'إلغاء حظر'}
            </button>
          </div>

          {/* ── Service exit / restore (separate from the ban) ──────── */}
          <div className="service-block">
            <h3 className="emp-heading">حالة الخدمة</h3>

            <label className="field">
              <span className="label">نوع الحالة</span>
              <select
                className="input"
                value={serviceStatus}
                onChange={(e) =>
                  setServiceStatus(e.target.value as ServiceExitStatus)
                }
                disabled={busyAny}
              >
                <option value="transferred">منقول من الإدارة</option>
                <option value="discharged">مسرّح من الخدمة</option>
                <option value="contract_ended">منتهي التعاقد</option>
              </select>
            </label>

            <label className="field">
              <span className="label">تاريخ الخروج</span>
              <input
                className="input"
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                disabled={busyAny}
              />
            </label>

            <label className="field">
              <span className="label">ملاحظة (اختياري)</span>
              <input
                className="input"
                dir="auto"
                value={serviceNote}
                onChange={(e) => setServiceNote(e.target.value)}
                disabled={busyAny}
              />
            </label>

            {serviceMsg && (
              <div
                className={`test-result ${
                  serviceMsg.ok ? 'test-ok' : 'test-error'
                }`}
              >
                {serviceMsg.text}
              </div>
            )}

            <div className="emp-actions">
              <button
                type="button"
                className="btn"
                disabled={busyAny}
                onClick={() => void runServiceExit()}
              >
                {busy === 'service-exit' ? '…' : 'تسجيل حالة الخروج'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busyAny}
                onClick={() => void runServiceRestore()}
              >
                {busy === 'service-restore' ? '…' : 'إعادة للخدمة'}
              </button>
            </div>
          </div>

          {/* ── View / issue the employee's barcode (Phase 3-a) ─────── */}
          <div className="service-block">
            <h3 className="emp-heading">باركود الموظف</h3>

            <div className="emp-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={barcodeLoading || actionSelfId.trim().length === 0}
                onClick={() => void showBarcode()}
              >
                {barcodeLoading ? 'جارٍ الجلب…' : 'عرض الباركود'}
              </button>
            </div>

            {barcodeErr && (
              <div className="test-result test-error">{barcodeErr}</div>
            )}

            {barcodeView && (
              <div className="emp-section">
                {barcodeView.barcodeToken === null ? (
                  <div className="test-result test-error">
                    الموظف غير مُفعّل — لا يوجد باركود بعد.
                  </div>
                ) : (
                  <>
                    <div className="qr-frame">
                      <QRCodeSVG
                        value={barcodeView.barcodeToken}
                        size={224}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#0f172a"
                      />
                    </div>

                    <div className="id-card">
                      <div className="id-name">{barcodeView.fullName}</div>
                      <div className="id-number">
                        {barcodeView.selfId}
                      </div>
                      {barcodeView.commandDepartment && (
                        <div className="id-dept">
                          {barcodeView.commandDepartment}
                        </div>
                      )}
                      {barcodeView.branch && (
                        <div className="id-dept">{barcodeView.branch}</div>
                      )}
                    </div>

                    <BarcodeActions
                      value={barcodeView.barcodeToken}
                      label={barcodeView.fullName}
                      fileBase={barcodeView.selfId}
                    />
                  </>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setBarcodeView(null)}
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>

          {/* ── Assign authorised gates (Phase 3-c) — gate-assign leadership only ── */}
          {false && (role === 'super_admin' || role === 'branch_head') &&
            actionSelfId && <EmployeeGatesPanel selfId={actionSelfId} />}
        </div>
      </main>
    </div>
  )
}
