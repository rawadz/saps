import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { QRCodeSVG } from 'qrcode.react'
import OfficialHeader from './OfficialHeader'
import { useInterval } from './useInterval'
import {
  ApiError,
  createVehiclePermit,
  describeApiError,
  getVehiclePermit,
  getVehiclePermitsList,
  type CreateVehiclePermitInput,
  type VehiclePermit,
  type VehiclePermitsListPage,
  type VehicleType,
} from './api'

type OwnerType = 'employee' | 'visitor'
type StatusFilter = '' | 'active' | 'expired' | 'revoked'
type TypeFilter = '' | VehicleType

interface Msg {
  ok: boolean
  text: string
}

interface Issued {
  id: string
  barcodeToken: string
  plateNumber: string
  vehicleType: VehicleType
}

type DirState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: VehiclePermitsListPage }
  | { phase: 'error'; message: string }

const PAGE_SIZE = 10

const VTYPE_AR: Record<string, string> = {
  private: 'خصوصي',
  public: 'عمومي',
  government: 'حكومي',
}

const STATUS_AR: Record<string, string> = {
  active: 'نشط',
  revoked: 'مُلغى',
  expired: 'منتهٍ',
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'active', label: 'نشط' },
  { value: 'expired', label: 'منتهٍ' },
  { value: 'revoked', label: 'مُلغى' },
]

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'private', label: 'خصوصي' },
  { value: 'public', label: 'عمومي' },
  { value: 'government', label: 'حكومي' },
]

// active = green; anything else (expired/revoked/…) = red. Reuses the existing badges.
function statusBadgeClass(s: string): string {
  return s === 'active' ? 'badge-ok' : 'badge-error'
}

function vehicleError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VEHICLE_MUST_HAVE_EXACTLY_ONE_OWNER') {
      return 'اختر مالكًا واحدًا فقط: موظف أو تصريح زائر.'
    }
    if (err.code === 'OWNER_EMPLOYEE_NOT_FOUND') return 'الموظف المالك غير موجود.'
    if (err.code === 'OWNER_VISITOR_PERMIT_NOT_FOUND') {
      return 'تصريح الزائر المالك غير موجود.'
    }
    if (err.code === 'PLATE_NUMBER_REQUIRED') return 'رقم اللوحة مطلوب.'
    if (err.code === 'INVALID_EXPIRY_DATE') return 'تاريخ الانتهاء غير صالح.'
    if (err.code === 'VEHICLE_PERMIT_NOT_FOUND') return 'تصريح المركبة غير موجود.'
    if (err.status === 403) return 'لا تملك صلاحية إصدار/عرض تصاريح المركبات.'
    if (err.status === 400) return 'بيانات غير صالحة — تحقّق من الحقول.'
  }
  return describeApiError(err)
}

export default function VehiclePermitsScreen() {
  // ── Issue form ──
  const [plateNumber, setPlateNumber] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('private')
  const [color, setColor] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [ownerType, setOwnerType] = useState<OwnerType>('employee')
  const [ownerEmployeeSelfId, setOwnerEmployeeSelfId] = useState('')
  const [ownerVisitorPermitNumber, setOwnerVisitorPermitNumber] = useState('')
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

  // ── Lookup / details (by id) ──
  const [lookupId, setLookupId] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupMsg, setLookupMsg] = useState<Msg | null>(null)
  const [fetched, setFetched] = useState<VehiclePermit | null>(null)

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
      const data = await getVehiclePermitsList(
        page,
        PAGE_SIZE,
        status || undefined,
        type || undefined,
        q || undefined,
      )
      setDir({ phase: 'ok', data })
    } catch (err) {
      // Silent auto-refresh keeps the current data on failure (retry next tick).
      if (!silent) setDir({ phase: 'error', message: vehicleError(err) })
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

    if (!plateNumber.trim()) {
      setCreateMsg({ ok: false, text: 'رقم اللوحة مطلوب.' })
      return
    }
    const ownerValue =
      ownerType === 'employee'
        ? ownerEmployeeSelfId.trim()
        : ownerVisitorPermitNumber.trim()
    if (!ownerValue) {
      setCreateMsg({
        ok: false,
        text:
          ownerType === 'employee'
            ? 'أدخل الرقم الوظيفي للمالك.'
            : 'أدخل رقم تصريح الزائر المالك.',
      })
      return
    }

    setCreating(true)
    try {
      const input: CreateVehiclePermitInput = {
        plateNumber: plateNumber.trim(),
        vehicleType,
      }
      if (color.trim()) input.color = color.trim()
      if (make.trim()) input.make = make.trim()
      if (model.trim()) input.model = model.trim()
      if (expiresAt) input.expiresAt = expiresAt
      // Exactly ONE owner — send only the selected one.
      if (ownerType === 'employee') {
        input.ownerEmployeeSelfId = ownerValue
      } else {
        input.ownerVisitorPermitNumber = ownerValue
      }

      const res = await createVehiclePermit(input)
      setIssued({
        id: res.id,
        barcodeToken: res.barcodeToken,
        plateNumber: plateNumber.trim(),
        vehicleType,
      })
      setCreateMsg({ ok: true, text: 'تم إصدار تصريح المركبة.' })
      // Clear the entered details (keep type + owner type).
      setPlateNumber('')
      setColor('')
      setMake('')
      setModel('')
      setExpiresAt('')
      setOwnerEmployeeSelfId('')
      setOwnerVisitorPermitNumber('')
      // The new vehicle is newest → it appears on page 1 (sorted newest first).
      void loadDir(1)
    } catch (err) {
      setCreateMsg({ ok: false, text: vehicleError(err) })
    } finally {
      setCreating(false)
    }
  }

  // Look up full details (incl. QR) by id. `idOverride` is passed when a directory
  // row is clicked; otherwise the manual lookup field is used.
  async function handleLookup(idOverride?: string) {
    setLookupMsg(null)
    setFetched(null)
    const id = (idOverride ?? lookupId).trim()
    if (!id) {
      setLookupMsg({ ok: false, text: 'أدخل مُعرّف المركبة (id).' })
      return
    }
    if (idOverride) setLookupId(idOverride)
    setLooking(true)
    try {
      setFetched(await getVehiclePermit(id))
    } catch (err) {
      setLookupMsg({ ok: false, text: vehicleError(err) })
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
        <p className="subtitle">تصاريح المركبات</p>

        {/* ── Issue a vehicle permit ────────────────────────────────── */}
        <form className="form" onSubmit={handleCreate}>
          <h2 className="emp-heading">إصدار تصريح مركبة</h2>

          <label className="field">
            <span className="label">رقم اللوحة *</span>
            <input
              className="input"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">نوع المركبة *</span>
            <select
              className="input"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              disabled={creating}
            >
              <option value="private">خصوصي</option>
              <option value="public">عمومي</option>
              <option value="government">حكومي</option>
            </select>
          </label>

          <label className="field">
            <span className="label">اللون (اختياري)</span>
            <input
              className="input"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الصنع (اختياري)</span>
            <input
              className="input"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الموديل (اختياري)</span>
            <input
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">تاريخ انتهاء التصريح (اختياري)</span>
            <input
              className="input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={creating}
            />
          </label>

          {/* Owner — exactly one of employee / visitor permit. */}
          <div className="field">
            <span className="label">المالك *</span>
            <div className="owner-toggle">
              <button
                type="button"
                className={`tab ${ownerType === 'employee' ? 'tab-active' : ''}`}
                onClick={() => setOwnerType('employee')}
              >
                موظف
              </button>
              <button
                type="button"
                className={`tab ${ownerType === 'visitor' ? 'tab-active' : ''}`}
                onClick={() => setOwnerType('visitor')}
              >
                تصريح زائر
              </button>
            </div>
          </div>

          {ownerType === 'employee' ? (
            <label className="field">
              <span className="label">الرقم الوظيفي للمالك *</span>
              <input
                className="input"
                value={ownerEmployeeSelfId}
                onChange={(e) => setOwnerEmployeeSelfId(e.target.value)}
                placeholder="EMP-20001"
                autoComplete="off"
                disabled={creating}
              />
            </label>
          ) : (
            <label className="field">
              <span className="label">رقم تصريح الزائر المالك *</span>
              <input
                className="input"
                value={ownerVisitorPermitNumber}
                onChange={(e) => setOwnerVisitorPermitNumber(e.target.value)}
                placeholder="VP-XXXXXXXXXX"
                autoComplete="off"
                disabled={creating}
              />
            </label>
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

        {/* ── Issued vehicle + its QR ───────────────────────────────── */}
        {issued && (
          <div className="emp-section">
            <div className="permit-result">
              <div className="permit-issued">تم إصدار تصريح المركبة ✓</div>
              <div className="permit-meta">
                اللوحة: <span>{issued.plateNumber}</span> —{' '}
                {VTYPE_AR[issued.vehicleType]}
              </div>
              <div className="vehicle-id">المُعرّف: {issued.id}</div>
              <div className="qr-frame">
                <QRCodeSVG
                  value={issued.barcodeToken}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
              </div>
              <p className="qr-hint">قدّم هذا الرمز على البوابة لمسحه</p>
            </div>
          </div>
        )}

        {/* ── Vehicle directory (live, from the backend) ────────────── */}
        <div className="emp-section">
          <h2 className="emp-heading">قائمة المركبات</h2>

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
              <span className="label">بحث برقم اللوحة</span>
              <input
                className="input"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="اكتب لوحة ثم اضغط بحث"
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
            <p className="log-empty">لا توجد مركبات مطابقة.</p>
          )}

          {dir.phase === 'ok' && dir.data.items.length > 0 && (
            <>
              <div className="log-list">
                {dir.data.items.map((v) => (
                  <div
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    className={`log-row emp-dir-row ${
                      v.id === lookupId ? 'emp-dir-selected' : ''
                    }`}
                    onClick={() => void handleLookup(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void handleLookup(v.id)
                      }
                    }}
                  >
                    <div className="log-row-head">
                      <span className="log-name">
                        {v.plateNumber}
                      </span>
                      <span className={`badge ${statusBadgeClass(v.status)}`}>
                        {STATUS_AR[v.status] ?? v.status}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      {v.vehicleType
                        ? (VTYPE_AR[v.vehicleType] ?? v.vehicleType)
                        : '—'}
                      {` • المالك: ${v.ownerType === 'employee' ? 'موظف' : 'زائر'}`}
                      {v.ownerName ? ` — ${v.ownerName}` : ''}
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

        {/* ── Look up / details by id (click a row above fills this) ── */}
        <div className="emp-section">
          <h2 className="emp-heading">عرض مركبة بالمُعرّف</h2>
          <label className="field">
            <span className="label">مُعرّف المركبة (UUID)</span>
            <input
              className="input"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
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
            disabled={looking || lookupId.trim().length === 0}
          >
            {looking ? 'جارٍ البحث…' : 'عرض المركبة'}
          </button>

          {fetched && (
            <div className="permit-result">
              <div className="permit-meta">
                اللوحة: <span>{fetched.plateNumber}</span>
              </div>
              <span
                className={`badge ${
                  fetched.status === 'active' ? 'badge-ok' : 'badge-error'
                }`}
              >
                {STATUS_AR[fetched.status] ?? fetched.status}
              </span>
              <div className="permit-meta">
                <div>
                  النوع:{' '}
                  {fetched.vehicleType
                    ? (VTYPE_AR[fetched.vehicleType] ?? fetched.vehicleType)
                    : '—'}
                </div>
                {fetched.color && <div>اللون: {fetched.color}</div>}
                {(fetched.make || fetched.model) && (
                  <div>
                    المركبة: {fetched.make ?? ''} {fetched.model ?? ''}
                  </div>
                )}
                <div>المالك: {fetched.employeeId ? 'موظف' : 'تصريح زائر'}</div>
              </div>
              {fetched.barcodeToken && (
                <div className="qr-frame">
                  <QRCodeSVG
                    value={fetched.barcodeToken}
                    size={200}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
