import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { QRCodeSVG } from 'qrcode.react'
import OfficialHeader from './OfficialHeader'
import BarcodeActions from './BarcodeActions'
import { useInterval } from './useInterval'
import {
  ApiError,
  createVisitorPermit,
  describeApiError,
  getVisitorPermit,
  getVisitorPermitsList,
  type CreatePermitInput,
  type PermitStatus,
  type PermitType,
  type VisitorPermit,
  type VisitorPermitsListPage,
} from './api'

type PersonnelType = 'civilian' | 'military'
type StatusFilter = '' | PermitStatus
type TypeFilter = '' | PermitType

interface Msg {
  ok: boolean
  text: string
}

interface Issued {
  permitNumber: string
  token: string
  visitorName: string
  host: string
  permitType: PermitType
}

type DirState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: VisitorPermitsListPage }
  | { phase: 'error'; message: string }

const PAGE_SIZE = 10

const PERMIT_TYPE_AR: Record<string, string> = {
  scheduled: 'مجدول',
  single_entry: 'أحادي الدخول',
}

const STATUS_AR: Record<string, string> = {
  active: 'نشط',
  used: 'مُستخدَم',
  expired: 'منتهٍ',
  cancelled: 'مُلغى',
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'used', label: 'مُستخدَم' },
  { value: 'expired', label: 'منتهٍ' },
  { value: 'cancelled', label: 'مُلغى' },
]

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'scheduled', label: 'مجدول' },
  { value: 'single_entry', label: 'أحادي الدخول' },
]

const DAYS = [
  { n: 0, label: 'الأحد' },
  { n: 1, label: 'الإثنين' },
  { n: 2, label: 'الثلاثاء' },
  { n: 3, label: 'الأربعاء' },
  { n: 4, label: 'الخميس' },
  { n: 5, label: 'الجمعة' },
  { n: 6, label: 'السبت' },
]

// active = green, used = grey, expired/cancelled = red. Reuses the existing badges.
function statusBadgeClass(s: PermitStatus): string {
  if (s === 'active') return 'badge-ok'
  if (s === 'used') return 'badge-pending'
  return 'badge-error'
}

function permitError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'PERMIT_NOT_FOUND') return 'التصريح غير موجود.'
    if (err.code === 'SCHEDULED_PERMIT_REQUIRES_DATE_WINDOW') {
      return 'التصريح المجدول يتطلّب تاريخ بداية ونهاية.'
    }
    if (err.code === 'END_DATE_BEFORE_START_DATE') {
      return 'تاريخ النهاية قبل تاريخ البداية.'
    }
    if (err.code === 'INVALID_DATE_WINDOW') return 'نطاق التاريخ غير صالح.'
    if (err.code === 'VISITOR_ID_REQUIRED') return 'هوية/هاتف الزائر مطلوبة.'
    if (err.code === 'MISSING_REQUIRED_PERMIT_FIELDS') {
      return 'حقول التصريح المطلوبة ناقصة.'
    }
    if (err.status === 403) return 'لا تملك صلاحية إصدار/عرض التصاريح.'
  }
  return describeApiError(err)
}

export default function VisitorPermitsScreen() {
  // ── Issue form ──
  const [permitType, setPermitType] = useState<PermitType>('single_entry')
  const [visitorName, setVisitorName] = useState('')
  const [idOrPhone, setIdOrPhone] = useState('')
  const [personnelType, setPersonnelType] = useState<PersonnelType>('civilian')
  const [host, setHost] = useState('')
  const [reason, setReason] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [allowedDays, setAllowedDays] = useState<number[]>([])
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<Msg | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)

  // ── Directory (live list from the backend) ──
  const [dir, setDir] = useState<DirState>({ phase: 'loading' })
  const [dirPage, setDirPage] = useState(1)
  const [fStatus, setFStatus] = useState<StatusFilter>('')
  const [fType, setFType] = useState<TypeFilter>('')
  const [qInput, setQInput] = useState('')
  const [qApplied, setQApplied] = useState('')

  // ── Lookup / details (by number) ──
  const [lookupNumber, setLookupNumber] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupMsg, setLookupMsg] = useState<Msg | null>(null)
  const [fetched, setFetched] = useState<VisitorPermit | null>(null)

  function toggleDay(n: number) {
    setAllowedDays((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n],
    )
  }

  // Load a directory page. Overrides let a tab/search apply immediately, before the
  // corresponding state update has flushed.
  async function loadDir(
    page: number,
    statusOverride?: StatusFilter,
    typeOverride?: TypeFilter,
    qOverride?: string,
    silent = false,
  ) {
    const status = statusOverride ?? fStatus
    const type = typeOverride ?? fType
    const q = qOverride ?? qApplied
    setDirPage(page)
    if (!silent) setDir({ phase: 'loading' })
    try {
      const data = await getVisitorPermitsList(
        page,
        PAGE_SIZE,
        status || undefined,
        type || undefined,
        q || undefined,
      )
      setDir({ phase: 'ok', data })
    } catch (err) {
      // Silent auto-refresh keeps the current data on failure (retry next tick).
      if (!silent) setDir({ phase: 'error', message: permitError(err) })
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
    void loadDir(dirPage, undefined, undefined, undefined, true)
  }, 10000)

  function applyStatus(s: StatusFilter) {
    setFStatus(s)
    void loadDir(1, s)
  }

  function applyType(t: TypeFilter) {
    setFType(t)
    void loadDir(1, undefined, t)
  }

  function applySearch() {
    const q = qInput.trim()
    setQApplied(q)
    void loadDir(1, undefined, undefined, q)
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
    setIssued(null)
    if (
      !visitorName.trim() ||
      !idOrPhone.trim() ||
      !host.trim() ||
      !reason.trim()
    ) {
      setCreateMsg({ ok: false, text: 'املأ كل الحقول المطلوبة (*).' })
      return
    }
    if (permitType === 'scheduled') {
      if (!startDate || !endDate) {
        setCreateMsg({
          ok: false,
          text: 'التصريح المجدول يتطلّب تاريخ بداية ونهاية.',
        })
        return
      }
      if (endDate < startDate) {
        setCreateMsg({ ok: false, text: 'تاريخ النهاية قبل تاريخ البداية.' })
        return
      }
    }
    setCreating(true)
    try {
      const input: CreatePermitInput = {
        permitType,
        visitorName: visitorName.trim(),
        idOrPhone: idOrPhone.trim(),
        personnelType,
        host: host.trim(),
        reason: reason.trim(),
      }
      if (permitType === 'scheduled') {
        input.startDate = startDate
        input.endDate = endDate
        if (allowedDays.length) input.allowedDays = allowedDays
        if (timeFrom) input.allowedTimeFrom = timeFrom
        if (timeTo) input.allowedTimeTo = timeTo
      }
      const res = await createVisitorPermit(input)
      setIssued({
        permitNumber: res.permitNumber,
        token: res.token,
        visitorName: visitorName.trim(),
        host: host.trim(),
        permitType,
      })
      setCreateMsg({ ok: true, text: `تم إصدار التصريح: ${res.permitNumber}` })
      // Clear the entered details (keep the type for the next one).
      setVisitorName('')
      setIdOrPhone('')
      setHost('')
      setReason('')
      setStartDate('')
      setEndDate('')
      setAllowedDays([])
      setTimeFrom('')
      setTimeTo('')
      // The new permit is newest → it appears on page 1 (sorted newest first).
      void loadDir(1)
    } catch (err) {
      setCreateMsg({ ok: false, text: permitError(err) })
    } finally {
      setCreating(false)
    }
  }

  // Look up full details (incl. QR) by number. `numberOverride` is passed when a
  // directory row is clicked; otherwise the manual lookup field is used.
  async function handleLookup(numberOverride?: string) {
    setLookupMsg(null)
    setFetched(null)
    const num = (numberOverride ?? lookupNumber).trim()
    if (!num) {
      setLookupMsg({ ok: false, text: 'أدخل رقم التصريح.' })
      return
    }
    if (numberOverride) setLookupNumber(numberOverride)
    setLooking(true)
    try {
      setFetched(await getVisitorPermit(num))
    } catch (err) {
      setLookupMsg({ ok: false, text: permitError(err) })
    } finally {
      setLooking(false)
    }
  }

  const totalPages =
    dir.phase === 'ok' ? Math.max(1, Math.ceil(dir.data.total / PAGE_SIZE)) : 1

  return (
    <div className="app">
      <main className="card visitor-card">
        <OfficialHeader />
        <p className="subtitle">تصاريح الزوار</p>

        {/* ── Issue a permit ────────────────────────────────────────── */}
        <form className="form" onSubmit={handleCreate}>
          <h2 className="emp-heading">إصدار تصريح زائر</h2>

          <label className="field">
            <span className="label">نوع التصريح *</span>
            <select
              className="input"
              value={permitType}
              onChange={(e) => setPermitType(e.target.value as PermitType)}
              disabled={creating}
            >
              <option value="single_entry">أحادي الدخول</option>
              <option value="scheduled">مجدول</option>
            </select>
          </label>

          <label className="field">
            <span className="label">اسم الزائر *</span>
            <input
              className="input"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الهوية / الهاتف *</span>
            <input
              className="input"
              value={idOrPhone}
              onChange={(e) => setIdOrPhone(e.target.value)}
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">نوع الشخص *</span>
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
            <span className="label">المضيف / الجهة *</span>
            <input
              className="input"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">السبب *</span>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={creating}
            />
          </label>

          {permitType === 'scheduled' && (
            <>
              <label className="field">
                <span className="label">تاريخ البداية *</span>
                <input
                  className="input"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={creating}
                />
              </label>
              <label className="field">
                <span className="label">تاريخ النهاية *</span>
                <input
                  className="input"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={creating}
                />
              </label>
              <div className="field">
                <span className="label">الأيام المسموحة (اختياري)</span>
                <div className="days-grid">
                  {DAYS.map((d) => (
                    <label
                      key={d.n}
                      className={`day-chip ${allowedDays.includes(d.n) ? 'day-on' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={allowedDays.includes(d.n)}
                        onChange={() => toggleDay(d.n)}
                        disabled={creating}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="field">
                <span className="label">من الساعة (اختياري)</span>
                <input
                  className="input"
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  disabled={creating}
                />
              </label>
              <label className="field">
                <span className="label">إلى الساعة (اختياري)</span>
                <input
                  className="input"
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  disabled={creating}
                />
              </label>
            </>
          )}

          {createMsg && (
            <div
              className={`test-result ${createMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {createMsg.text}
            </div>
          )}

          <button className="btn btn-scan" type="submit" disabled={creating}>
            {creating ? 'جارٍ الإصدار…' : 'إصدار التصريح'}
          </button>
        </form>

        {/* ── Issued permit + its QR ────────────────────────────────── */}
        {issued && (
          <div className="emp-section">
            <div className="permit-result">
              <div className="permit-issued">تم إصدار التصريح ✓</div>
              <div className="permit-number">{issued.permitNumber}</div>
              <div className="permit-meta">
                {issued.visitorName} — {PERMIT_TYPE_AR[issued.permitType]} —
                المضيف: {issued.host}
              </div>
              <div className="qr-frame">
                <QRCodeSVG
                  value={issued.token}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
              </div>
              <p className="qr-hint">قدّم هذا الرمز على البوابة لمسحه</p>
              <BarcodeActions
                value={issued.token}
                label={issued.permitNumber}
                fileBase={`permit_${issued.permitNumber}`}
              />
            </div>
          </div>
        )}

        {/* ── Permit directory (live, from the backend) ─────────────── */}
        <div className="emp-section">
          <h2 className="emp-heading">قائمة التصاريح</h2>

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

          <div className="owner-toggle">
            {TYPE_TABS.map((t) => (
              <button
                key={t.value || 'all'}
                type="button"
                className={`tab ${fType === t.value ? 'tab-active' : ''}`}
                onClick={() => applyType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="log-filters">
            <label className="field">
              <span className="label">بحث باسم الزائر</span>
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

          {dir.phase === 'loading' && (
            <p className="log-empty">جارٍ تحميل القائمة…</p>
          )}

          {dir.phase === 'error' && (
            <div className="test-result test-error">{dir.message}</div>
          )}

          {dir.phase === 'ok' && dir.data.items.length === 0 && (
            <p className="log-empty">لا توجد تصاريح مطابقة.</p>
          )}

          {dir.phase === 'ok' && dir.data.items.length > 0 && (
            <>
              <div className="log-list">
                {dir.data.items.map((p) => (
                  <div
                    key={p.permitNumber}
                    role="button"
                    tabIndex={0}
                    className={`log-row emp-dir-row ${
                      p.permitNumber === lookupNumber ? 'emp-dir-selected' : ''
                    }`}
                    onClick={() => void handleLookup(p.permitNumber)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void handleLookup(p.permitNumber)
                      }
                    }}
                  >
                    <div className="log-row-head">
                      <span className="log-name">{p.visitorName}</span>
                      <span className={`badge ${statusBadgeClass(p.status)}`}>
                        {STATUS_AR[p.status] ?? p.status}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      <span>{p.permitNumber}</span>
                      {` • ${PERMIT_TYPE_AR[p.permitType] ?? p.permitType}`}
                      {` • المضيف: ${p.host}`}
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

        {/* ── Look up / details by number (click a row above fills this) ── */}
        <div className="emp-section">
          <h2 className="emp-heading">عرض تصريح بالرقم</h2>
          <label className="field">
            <span className="label">رقم التصريح</span>
            <input
              className="input"
              value={lookupNumber}
              onChange={(e) => setLookupNumber(e.target.value)}
              placeholder="VP-XXXXXXXXXX"
              autoComplete="off"
              disabled={looking}
            />
          </label>

          {lookupMsg && (
            <div
              className={`test-result ${lookupMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {lookupMsg.text}
            </div>
          )}

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void handleLookup()}
            disabled={looking || lookupNumber.trim().length === 0}
          >
            {looking ? 'جارٍ البحث…' : 'عرض التصريح'}
          </button>

          {fetched && (
            <div className="permit-result">
              <div className="permit-number">{fetched.permitNumber}</div>
              <span
                className={`badge ${
                  fetched.status === 'active' ? 'badge-ok' : 'badge-error'
                }`}
              >
                {STATUS_AR[fetched.status] ?? fetched.status}
              </span>
              <div className="permit-meta">
                <div>الزائر: {fetched.visitorName}</div>
                <div>النوع: {PERMIT_TYPE_AR[fetched.permitType]}</div>
                <div>المضيف: {fetched.host}</div>
                {fetched.idOrPhone && (
                  <div>
                    الهوية/الهاتف: <span>{fetched.idOrPhone}</span>
                  </div>
                )}
                {fetched.reason && <div>السبب: {fetched.reason}</div>}
                {fetched.permitType === 'scheduled' && fetched.startDate && (
                  <div>
                    المدة: <span>{fetched.startDate.slice(0, 10)}</span>{' '}
                    ←{' '}
                    <span>{fetched.endDate?.slice(0, 10) ?? '—'}</span>
                  </div>
                )}
              </div>
              {fetched.token && (
                <>
                  <div className="qr-frame">
                    <QRCodeSVG
                      value={fetched.token}
                      size={200}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                    />
                  </div>
                  <BarcodeActions
                    value={fetched.token}
                    label={fetched.permitNumber}
                    fileBase={`permit_${fetched.permitNumber}`}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
