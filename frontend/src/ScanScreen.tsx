import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import {
  describeApiError,
  gateScan,
  getGuardGates,
  getMyGate,
  setMyGate,
  type EmployeeScanInfo,
  type GuardGateOption,
  type ScanDecision,
  type ScanSubject,
  type VehicleScanInfo,
  type VisitorScanInfo,
} from './api'
import OfficialHeader from './OfficialHeader'

interface ScanScreenProps {
  onLogout: () => void
}

// The DOM node html5-qrcode renders the live camera preview into.
const READER_ID = 'qr-reader'

// Arabic labels for the backend's RED reason codes (employee + permit + vehicle).
const REASON_LABELS: Record<string, string> = {
  INVALID_BARCODE: 'باركود غير صالح',
  BANNED: 'محظور',
  NOT_FOUND: 'غير موجود',
  INACTIVE: 'الحساب غير مُفعّل',
  GATE_NOT_AUTHORIZED: 'غير مصرّح له بالعبور من هذه البوابة',
  PERMIT_NOT_FOUND: 'التصريح غير موجود',
  ALREADY_USED: 'تصريح مُستخدَم سابقًا',
  EXPIRED: 'منتهي الصلاحية',
  CANCELLED: 'مُلغى',
  NOT_ACTIVE: 'غير نشط',
  OUT_OF_DATE_RANGE: 'خارج المدة المسموحة',
  DAY_NOT_ALLOWED: 'اليوم غير مسموح',
  OUTSIDE_HOURS: 'خارج ساعات السماح',
  VEHICLE_NOT_FOUND: 'المركبة غير موجودة',
  VEHICLE_INACTIVE: 'تصريح المركبة غير نشط',
  VEHICLE_EXPIRED: 'تصريح المركبة منتهٍ',
  VEHICLE_NO_OWNER: 'مركبة بلا مالك',
  OWNER_BANNED: 'مالك المركبة محظور',
  OWNER_INACTIVE: 'مالك المركبة غير نشط',
  OWNER_NOT_FOUND: 'مالك المركبة غير موجود',
  OWNER_PERMIT_NOT_FOUND: 'تصريح المالك غير موجود',
}

function reasonArabic(code: string): string {
  return REASON_LABELS[code] ?? 'مرفوض'
}

// ── Subject-detail rendering (guard visual verification) ─────────────────────
const PERSONNEL_AR: Record<string, string> = {
  civilian: 'مدني',
  military: 'عسكري',
}
const PERMIT_TYPE_AR: Record<string, string> = {
  scheduled: 'مجدول',
  single_entry: 'دخول واحد',
}
const VEHICLE_TYPE_AR: Record<string, string> = {
  private: 'خصوصي',
  public: 'عمومي',
  government: 'حكومي',
}
const OWNER_TYPE_AR: Record<string, string> = {
  employee: 'موظف',
  visitor: 'زائر',
}
// Service/employment exit statuses (shown at the gate when not 'active').
const SERVICE_STATUS_AR: Record<string, string> = {
  transferred: 'منقول من الإدارة',
  discharged: 'مسرّح من الخدمة',
  contract_ended: 'منتهي التعاقد',
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** One label/value row — renders nothing when the value is empty (no blank rows). */
function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string | null
  valueClass?: string
}) {
  if (!value) return null
  return (
    <div className="scan-detail-row">
      <span className="scan-detail-label">{label}</span>
      <span
        className={`scan-detail-value${valueClass ? ` ${valueClass}` : ''}`}
        dir="auto"
      >
        {value}
      </span>
    </div>
  )
}

function EmployeeDetails({ info }: { info: EmployeeScanInfo }) {
  const subEntity =
    [info.commandDepartment, info.branch].filter(Boolean).join(' — ') || null
  // A non-active service status is a key rejection reason — surfaced in a highlighted
  // block so the guard sees the status, its documented date, and any note.
  const outOfService = info.serviceStatus !== 'active'
  return (
    <>
      <DetailRow label="الاسم الثلاثي" value={info.fullName} />
      <DetailRow label="الجهة الفرعية" value={subEntity} />
      <DetailRow label="الأهمية" value={info.priority} />
      <DetailRow
        label="النوع"
        value={PERSONNEL_AR[info.personnelType] ?? info.personnelType}
      />
      {info.personnelType === 'military' && (
        <DetailRow label="الرتبة" value={info.rank} />
      )}
      <DetailRow label="المسمّى الوظيفي" value={info.currentJobTitle} />
      {outOfService && (
        <div className="scan-service">
          <div className="scan-detail-subhead">حالة الخدمة</div>
          <DetailRow
            label="الحالة"
            value={SERVICE_STATUS_AR[info.serviceStatus] ?? info.serviceStatus}
            valueClass="scan-service-value"
          />
          <DetailRow label="تاريخ الخروج" value={fmtDate(info.serviceExitDate)} />
          <DetailRow label="ملاحظة" value={info.serviceExitNote} />
        </div>
      )}
    </>
  )
}

function VisitorDetails({ info }: { info: VisitorScanInfo }) {
  const period =
    info.permitType === 'scheduled' && (info.startDate || info.endDate)
      ? `من ${fmtDate(info.startDate) ?? '—'} إلى ${fmtDate(info.endDate) ?? '—'}`
      : null
  return (
    <>
      <DetailRow label="الاسم" value={info.visitorName} />
      <DetailRow
        label="نوع التصريح"
        value={PERMIT_TYPE_AR[info.permitType] ?? info.permitType}
      />
      <DetailRow label="المضيف" value={info.host} />
      <DetailRow label="السبب" value={info.reason} />
      <DetailRow
        label="النوع"
        value={
          info.personnelType
            ? (PERSONNEL_AR[info.personnelType] ?? info.personnelType)
            : null
        }
      />
      <DetailRow label="الفترة" value={period} />
    </>
  )
}

function VehicleDetails({ info }: { info: VehicleScanInfo }) {
  return (
    <>
      <DetailRow label="رقم اللوحة" value={info.plateNumber} />
      <DetailRow
        label="نوع المركبة"
        value={
          info.vehicleType
            ? (VEHICLE_TYPE_AR[info.vehicleType] ?? info.vehicleType)
            : null
        }
      />
      <DetailRow
        label="نوع المالك"
        value={OWNER_TYPE_AR[info.ownerType] ?? info.ownerType}
      />
      {info.owner && (
        <div className="scan-owner">
          <div className="scan-detail-subhead">بيانات المالك</div>
          {info.owner.kind === 'employee' ? (
            <EmployeeDetails info={info.owner} />
          ) : (
            <VisitorDetails info={info.owner} />
          )}
        </div>
      )}
    </>
  )
}

function SubjectDetails({ subject }: { subject: ScanSubject }) {
  return (
    <div className="scan-details">
      {subject.kind === 'employee' && <EmployeeDetails info={subject} />}
      {subject.kind === 'visitor' && <VisitorDetails info={subject} />}
      {subject.kind === 'vehicle' && <VehicleDetails info={subject} />}
    </div>
  )
}

function cameraErrorMessage(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'تم رفض إذن الكاميرا. اسمح بالوصول إليها من إعدادات المتصفّح ثم أعد المحاولة.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'لا توجد كاميرا متاحة على هذا الجهاز.'
  }
  return 'تعذّر تشغيل الكاميرا. استخدم الإدخال اليدوي بالأسفل.'
}

// Loading the guard's station picker is a double-fetch (the active gate list + the
// guard's currently-pinned station); model it as a discriminated union.
type GatesPhase =
  | { phase: 'loading' }
  | { phase: 'ok'; options: GuardGateOption[]; selectedId: string | null }
  | { phase: 'error'; message: string }

export default function ScanScreen({ onLogout }: ScanScreenProps) {
  const [barcode, setBarcode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState<ScanDecision | null>(null)

  // ── Guard station picker (Phase 4) — replaces the old free-text gate field ──
  const [station, setStation] = useState<GatesPhase>({ phase: 'loading' })
  const [pinning, setPinning] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinOk, setPinOk] = useState(false)

  // Camera state (an ADDITIONAL input source — runScan and the result are untouched).
  const [cameraRequested, setCameraRequested] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const handledRef = useRef(false)

  // Barcode-source-agnostic: both the manual field and the camera feed it.
  async function runScan(rawBarcode: string) {
    const value = rawBarcode.trim()
    if (!value) return
    setError(null)
    setLoading(true)
    try {
      const res = await gateScan({ barcode: value })
      setDecision(res)
    } catch (err) {
      // A RED decision is a normal 200 result; this only fires on auth/network errors.
      setError(describeApiError(err))
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void runScan(barcode)
  }

  function resetScan() {
    setDecision(null)
    setError(null)
    setBarcode('')
  }

  // Load the active gate list + the guard's currently-pinned station once on mount.
  async function loadStations() {
    setPinError(null)
    setPinOk(false)
    setStation({ phase: 'loading' })
    try {
      const [options, myGate] = await Promise.all([
        getGuardGates(),
        getMyGate(),
      ])
      setStation({ phase: 'ok', options, selectedId: myGate?.id ?? null })
    } catch (err) {
      setStation({ phase: 'error', message: describeApiError(err) })
    }
  }

  useEffect(() => {
    void loadStations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pin the chosen gate as the guard's station (stored server-side in their session).
  async function pinStation(id: string) {
    setPinning(true)
    setPinError(null)
    setPinOk(false)
    try {
      await setMyGate(id)
      // Copy the union state (never mutate it directly) to reflect the new selection.
      setStation((s) => (s.phase === 'ok' ? { ...s, selectedId: id } : s))
      setPinOk(true)
    } catch (err) {
      setPinError(describeApiError(err))
    } finally {
      setPinning(false)
    }
  }

  // Camera lifecycle. The effect runs only when the user opens the camera
  // (cameraRequested), so StrictMode's mount double-invoke (which happens while the
  // camera is OFF) never races a real start/stop. On a successful read it hands the
  // decoded text to the EXISTING runScan and closes the camera.
  function requestCamera() {
    setCameraError(null)
    // getUserMedia needs a secure context: localhost and https (Ngrok) qualify, a
    // plain http://<LAN-IP> does not. Keep manual entry working and say why.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'الكاميرا تحتاج اتصالًا آمنًا (HTTPS) — افتح الواجهة عبر رابط Ngrok على الهاتف. الإدخال اليدوي يعمل في كل الأحوال.',
      )
      return
    }
    setCameraRequested(true)
  }

  useEffect(() => {
    if (!cameraRequested) return

    const scanner = new Html5Qrcode(READER_ID)
    handledRef.current = false

    const started = scanner
      .start(
        { facingMode: 'environment' }, // prefer the back camera
        {
          fps: 10,
          qrbox: (w: number, h: number) => {
            const size = Math.floor(Math.min(w, h) * 0.7)
            return { width: size, height: size }
          },
        },
        (decodedText: string) => {
          if (handledRef.current) return
          handledRef.current = true
          setCameraRequested(false) // closes the camera via this effect's cleanup
          void runScan(decodedText) // hand off to the EXISTING scan logic
        },
        () => undefined, // per-frame decode misses — ignore
      )
      .then(() => setCameraOn(true))
      .catch((err: unknown) => {
        setCameraError(cameraErrorMessage(err))
        setCameraRequested(false)
      })

    return () => {
      // Wait for start() to settle, THEN stop — so a camera stream is never left
      // running (also correct if cleanup fires before start resolves).
      void started
        .then(() => scanner.stop())
        .then(() => scanner.clear())
        .catch(() => undefined)
      setCameraOn(false)
    }
  }, [cameraRequested])

  return (
    <div className="app">
      <main className="card scan-card">
        <OfficialHeader />
        <div className="scan-header">
          <h1 className="title scan-title">مسح البوابة</h1>
          <button type="button" className="logout-link" onClick={onLogout}>
            خروج
          </button>
        </div>

        {decision ? (
          <div
            className={`scan-result ${
              decision.result === 'GREEN' ? 'scan-green' : 'scan-red'
            }`}
          >
            <div className="scan-icon">
              {decision.result === 'GREEN' ? '✓' : '✗'}
            </div>
            <div className="scan-verdict">
              {decision.result === 'GREEN' ? 'مسموح بالدخول' : 'مرفوض'}
            </div>

            {decision.result === 'GREEN' ? (
              <>
                {/* dir="auto" picks the base direction from the name's own first
                    strong character — robust for Arabic or any-script names. NOTE:
                    this only fixes a DIRECTION/order issue; it cannot repair a value
                    whose BYTES are already corrupt (see the diagnosis note). */}
                <div className="scan-subject" dir="auto">
                  {decision.subjectName}
                </div>
                {decision.department && (
                  <div className="scan-dept" dir="auto">
                    {decision.department}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="scan-reason">{reasonArabic(decision.reason)}</div>
                <div className="scan-code">{decision.reason}</div>
              </>
            )}

            {decision.subject && <SubjectDetails subject={decision.subject} />}

            <button type="button" className="btn" onClick={resetScan}>
              مسح جديد
            </button>
          </div>
        ) : (
          <>
            {/* ── Guard station picker (Phase 4) ─────────────────────────────── */}
            <div className="field">
              <span className="label">محطّة البوابة</span>

              {station.phase === 'loading' && (
                <p className="qr-reader-hint">جارٍ تحميل البوابات…</p>
              )}

              {station.phase === 'error' && (
                <>
                  <p className="form-error">{station.message}</p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void loadStations()}
                  >
                    إعادة المحاولة
                  </button>
                </>
              )}

              {station.phase === 'ok' && (
                <>
                  <select
                    className="input"
                    value={station.selectedId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value || null
                      if (id) void pinStation(id)
                    }}
                    disabled={pinning}
                  >
                    <option value="">— اختر المحطّة —</option>
                    {station.options.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>

                  {station.selectedId === null && (
                    <span className="field-hint">
                      لم تُحدَّد المحطّة — سيُسجَّل المسح دون اسم بوّابة.
                    </span>
                  )}
                  {pinError && <p className="form-error">{pinError}</p>}
                  {pinOk && (
                    <span className="field-hint">تم تعيين المحطّة.</span>
                  )}
                </>
              )}
            </div>

            {/* ── Camera (alternative input source) ──────────────────────────── */}
            {cameraRequested && (
              <div className="qr-reader-wrap">
                <div id={READER_ID} className="qr-reader" />
                {!cameraOn && (
                  <p className="qr-reader-hint">جارٍ تشغيل الكاميرا…</p>
                )}
              </div>
            )}

            {cameraError && <p className="form-error">{cameraError}</p>}

            {cameraRequested ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCameraRequested(false)}
              >
                إيقاف الكاميرا
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-camera"
                onClick={requestCamera}
                disabled={loading}
              >
                مسح بالكاميرا
              </button>
            )}

            <div className="scan-or">أو الإدخال اليدوي</div>

            {/* ── Manual input (UNCHANGED) ───────────────────────────────────── */}
            <form className="form" onSubmit={handleSubmit}>
              <label className="field">
                <span className="label">الباركود</span>
                <input
                  className="input"
                  type="text"
                  dir="ltr"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="v1.xxxxx.yyyyy"
                  autoComplete="off"
                  autoFocus
                  disabled={loading}
                />
              </label>
              {error && <p className="form-error">{error}</p>}

              <button
                className="btn btn-scan"
                type="submit"
                disabled={loading || barcode.trim().length === 0}
              >
                {loading ? 'جارٍ المسح…' : 'مسح'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
