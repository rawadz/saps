import { useEffect, useRef, useState } from 'react'
import type { WorkSheet } from 'xlsx'
import OfficialHeader from './OfficialHeader'
import { useInterval } from './useInterval'
import {
  ApiError,
  describeApiError,
  getDailyStats,
  getGateLog,
  type DailyStats,
  type GateLogPage,
  type GateLogQuery,
  type GateLogRow,
} from './api'

const PAGE_SIZE = 10

type StatsState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: DailyStats }
  | { phase: 'error'; message: string }

type LogState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: GateLogPage }
  | { phase: 'error'; message: string }

type ResultFilter = '' | 'GREEN' | 'RED'

// Arabic for the backend's RED reason codes (fallback: show the raw code).
const REASON_AR: Record<string, string> = {
  INVALID_BARCODE: 'باركود غير صالح',
  BANNED: 'محظور',
  NOT_FOUND: 'غير موجود',
  INACTIVE: 'غير مُفعّل',
  PERMIT_NOT_FOUND: 'التصريح غير موجود',
  ALREADY_USED: 'تصريح مُستخدَم',
  EXPIRED: 'منتهٍ',
  CANCELLED: 'مُلغى',
  OUT_OF_DATE_RANGE: 'خارج المدة',
  DAY_NOT_ALLOWED: 'يوم غير مسموح',
  OUTSIDE_HOURS: 'خارج الساعات',
  VEHICLE_NOT_FOUND: 'المركبة غير موجودة',
  VEHICLE_INACTIVE: 'تصريح المركبة غير نشط',
  VEHICLE_EXPIRED: 'تصريح المركبة منتهٍ',
  OWNER_BANNED: 'المالك محظور',
  OWNER_INACTIVE: 'المالك غير نشط',
  OWNER_NOT_FOUND: 'المالك غير موجود',
}

function reportError(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) {
    return 'لا تملك صلاحية عرض التقارير.'
  }
  return describeApiError(err)
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Full date-time for the Excel export (DD/MM/YYYY HH:mm).
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Subject-type labels for the export ('guard' included for completeness).
const SUBJECT_TYPE_AR: Record<string, string> = {
  employee: 'موظف',
  permit: 'زائر',
  vehicle: 'مركبة',
  guard: 'حارس',
}

function rowName(row: GateLogRow): string {
  const name = row.subjectName ?? '—'
  return row.subjectOwnerName ? `${name} (${row.subjectOwnerName})` : name
}

export default function ReportsScreen() {
  const [stats, setStats] = useState<StatsState>({ phase: 'loading' })
  const [log, setLog] = useState<LogState>({ phase: 'loading' })

  // Filters
  const [fResult, setFResult] = useState<ResultFilter>('')
  const [fGate, setFGate] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  // The filters the CURRENTLY-shown log reflects (snapshotted on the last manual
  // search). The silent auto-refresh reuses these so it never applies an unsearched
  // filter edit.
  const appliedRef = useRef<Omit<GateLogQuery, 'page' | 'pageSize'>>({})

  // Excel export state.
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  )

  async function loadStats(silent = false) {
    if (!silent) setStats({ phase: 'loading' })
    try {
      setStats({ phase: 'ok', data: await getDailyStats() })
    } catch (err) {
      // Silent auto-refresh keeps the current stats on failure (retry next tick).
      if (!silent) setStats({ phase: 'error', message: reportError(err) })
    }
  }

  async function loadLog(page: number, silent = false) {
    if (!silent) {
      setLog({ phase: 'loading' })
      // A manual load snapshots the filters this result reflects; the silent
      // refresh below reuses them instead of the (possibly unsearched) inputs.
      const f: Omit<GateLogQuery, 'page' | 'pageSize'> = {}
      if (fResult) f.result = fResult
      if (fGate.trim()) f.gateName = fGate.trim()
      if (fFrom) f.from = `${fFrom}T00:00:00`
      if (fTo) f.to = `${fTo}T23:59:59`
      appliedRef.current = f
    }
    try {
      const query: GateLogQuery = {
        page,
        pageSize: PAGE_SIZE,
        ...appliedRef.current,
      }
      setLog({ phase: 'ok', data: await getGateLog(query) })
    } catch (err) {
      if (!silent) setLog({ phase: 'error', message: reportError(err) })
    }
  }

  useEffect(() => {
    void loadStats()
    void loadLog(1)
    // Mount only — filters are applied via the search button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent auto-refresh every 10s — refresh the stats and the CURRENT log page using
  // the last-applied filters; no loading flicker, failures ignored until next tick.
  useInterval(() => {
    const currentPage = log.phase === 'ok' ? log.data.page : 1
    void loadStats(true)
    void loadLog(currentPage, true)
  }, 10000)

  // Export the FULL filtered gate log (all pages, not just the shown one) to .xlsx.
  async function handleExport() {
    setExportMsg(null)
    setExporting(true)
    try {
      // Lazy-load SheetJS only when exporting — keeps it out of the initial bundle.
      const XLSX = await import('xlsx')
      const EXPORT_PAGE_SIZE = 50
      const all: GateLogRow[] = []
      let pageNo = 1
      // Page through with the SAME filters the table reflects, using the max page
      // size to minimise round trips; stop at the last (short) page.
      for (;;) {
        const data = await getGateLog({
          page: pageNo,
          pageSize: EXPORT_PAGE_SIZE,
          ...appliedRef.current,
        })
        all.push(...data.items)
        if (data.items.length < EXPORT_PAGE_SIZE) break
        pageNo += 1
      }

      if (all.length === 0) {
        setExportMsg({ ok: false, text: 'لا توجد سجلّات مطابقة للتصدير.' })
        return
      }

      const header = [
        'التاريخ والوقت',
        'البوابة',
        'النتيجة',
        'السبب',
        'الاسم',
        'نوع العنصر',
        'اسم المالك',
        'الحارس',
      ]
      const rows = all.map((r) => [
        fmtDateTime(r.occurredAt),
        r.gateName ?? '',
        r.result === 'GREEN' ? 'مسموح' : 'مرفوض',
        r.reason ? (REASON_AR[r.reason] ?? r.reason) : '',
        r.subjectName ?? '',
        r.subjectType ? (SUBJECT_TYPE_AR[r.subjectType] ?? r.subjectType) : '',
        r.subjectOwnerName ?? '',
        r.guardName ?? '',
      ])

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      ws['!cols'] = [
        { wch: 18 }, // التاريخ والوقت
        { wch: 12 }, // البوابة
        { wch: 9 }, // النتيجة
        { wch: 20 }, // السبب
        { wch: 24 }, // الاسم
        { wch: 12 }, // نوع العنصر
        { wch: 24 }, // اسم المالك
        { wch: 18 }, // الحارس
      ]
      // Right-to-left sheet view for Arabic ('!views' is outside the typed surface).
      const rtlWs = ws as WorkSheet & { '!views'?: Array<{ RTL: boolean }> }
      rtlWs['!views'] = [{ RTL: true }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'حركة البوابة')

      const now = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
      XLSX.writeFile(wb, `تقرير_حركة_البوابة_${stamp}.xlsx`)

      setExportMsg({ ok: true, text: `تم تصدير ${all.length} سجلّاً.` })
    } catch (err) {
      // Do not download a partial file — report the failure and bail.
      setExportMsg({ ok: false, text: `تعذّر التصدير: ${reportError(err)}` })
    } finally {
      setExporting(false)
    }
  }

  const page = log.phase === 'ok' ? log.data.page : 1
  const totalPages =
    log.phase === 'ok' ? Math.max(1, Math.ceil(log.data.total / PAGE_SIZE)) : 1

  return (
    <div className="app">
      <main className="card reports-card">
        <OfficialHeader />
        <p className="subtitle">التقارير</p>

        {/* ── Daily stats ───────────────────────────────────────────── */}
        <h2 className="emp-heading">إحصاءات اليوم</h2>
        {stats.phase === 'loading' && (
          <p className="log-empty">جارٍ تحميل الإحصاءات…</p>
        )}
        {stats.phase === 'error' && (
          <div className="test-result test-error">{stats.message}</div>
        )}
        {stats.phase === 'ok' && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-num">{stats.data.totalScans}</div>
              <div className="stat-label">إجمالي المسح</div>
            </div>
            <div className="stat-card">
              <div className="stat-num stat-ok">{stats.data.approved}</div>
              <div className="stat-label">المسموح</div>
            </div>
            <div className="stat-card">
              <div className="stat-num stat-bad">{stats.data.denied}</div>
              <div className="stat-label">المرفوض</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{stats.data.visitorEntries}</div>
              <div className="stat-label">دخول الزوار</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{stats.data.vehicleEntries}</div>
              <div className="stat-label">دخول المركبات</div>
            </div>
          </div>
        )}

        {/* ── Gate movement log ─────────────────────────────────────── */}
        <div className="emp-section">
          <h2 className="emp-heading">سجل حركة البوابة</h2>

          <div className="owner-toggle">
            <button
              type="button"
              className={`tab ${fResult === '' ? 'tab-active' : ''}`}
              onClick={() => setFResult('')}
            >
              الكل
            </button>
            <button
              type="button"
              className={`tab ${fResult === 'GREEN' ? 'tab-active' : ''}`}
              onClick={() => setFResult('GREEN')}
            >
              مسموح
            </button>
            <button
              type="button"
              className={`tab ${fResult === 'RED' ? 'tab-active' : ''}`}
              onClick={() => setFResult('RED')}
            >
              مرفوض
            </button>
          </div>

          <div className="log-filters">
            <label className="field">
              <span className="label">البوابة</span>
              <input
                className="input"
                value={fGate}
                onChange={(e) => setFGate(e.target.value)}
                placeholder="GATE-A"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span className="label">من تاريخ</span>
              <input
                className="input"
                type="date"
                value={fFrom}
                onChange={(e) => setFFrom(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">إلى تاريخ</span>
              <input
                className="input"
                type="date"
                value={fTo}
                onChange={(e) => setFTo(e.target.value)}
              />
            </label>
          </div>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void loadLog(1)}
            disabled={log.phase === 'loading'}
          >
            {log.phase === 'loading' ? 'جارٍ البحث…' : 'بحث'}
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || log.phase === 'loading'}
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

          {log.phase === 'error' && (
            <div className="test-result test-error">{log.message}</div>
          )}

          {log.phase === 'ok' && log.data.items.length === 0 && (
            <p className="log-empty">لا توجد سجلّات مطابقة.</p>
          )}

          {log.phase === 'ok' && log.data.items.length > 0 && (
            <>
              <div className="log-list">
                {log.data.items.map((row) => (
                  <div
                    key={row.id}
                    className={`log-row ${
                      row.result === 'GREEN' ? 'log-row-green' : 'log-row-red'
                    }`}
                  >
                    <div className="log-row-head">
                      <span className="log-name">{rowName(row)}</span>
                      <span
                        className={`badge ${
                          row.result === 'GREEN' ? 'badge-ok' : 'badge-error'
                        }`}
                      >
                        {row.result === 'GREEN' ? 'مسموح' : 'مرفوض'}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      <span>{fmtTime(row.occurredAt)}</span>
                      {row.gateName ? ` • ${row.gateName}` : ''}
                    </div>
                    {row.reason && (
                      <div className="log-reason">
                        السبب: {REASON_AR[row.reason] ?? row.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="log-pager">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void loadLog(page - 1)}
                  disabled={page <= 1}
                >
                  السابق
                </button>
                <span>
                  صفحة {page} من {totalPages} — الإجمالي {log.data.total}
                </span>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void loadLog(page + 1)}
                  disabled={page >= totalPages}
                >
                  التالي
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
