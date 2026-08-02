import { useRef, useState, type ChangeEvent } from 'react'
import {
  bulkActivateEmployees,
  bulkCreateEmployees,
  describeApiError,
  type BulkActivateReport,
  type BulkCreateReport,
  type BulkEmployeeItem,
} from './api'

interface EmployeeImportProps {
  /** Reload the live directory after a successful import / activation. */
  onChanged: () => void
}

// Arabic template headers → fields. Headers are normalised (drop "*"/"(optional)",
// collapse spaces, un-space "/") before matching, so " *" and "(اختياري)" are tolerated.
const HEADER_MAP: Record<string, keyof BulkEmployeeItem> = {
  'الرقم الوظيفي': 'selfId',
  'الاسم الكامل': 'fullName',
  النوع: 'personnelType',
  'رقم الهاتف': 'phone',
  'الرقم العسكري': 'militaryId',
  'الإدارة/القسم': 'commandDepartment',
  الفرع: 'branch',
  الرتبة: 'rank',
  'المسمى الوظيفي': 'currentJobTitle',
  الأهمية: 'priority',
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\(.*?\)/g, '') // drop "(اختياري)" etc.
    .replace(/\*/g, '') // drop the required marker
    .replace(/\s*\/\s*/g, '/') // unify "الإدارة / القسم" → "الإدارة/القسم"
    .replace(/\s+/g, ' ')
    .trim()
}

const PREVIEW_ROWS = 5

export default function EmployeeImport({ onChanged }: EmployeeImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<BulkEmployeeItem[] | null>(null)

  const [importing, setImporting] = useState(false)
  const [createReport, setCreateReport] = useState<BulkCreateReport | null>(null)

  const [activating, setActivating] = useState(false)
  const [activateReport, setActivateReport] = useState<BulkActivateReport | null>(
    null,
  )

  function reset() {
    setError(null)
    setRows(null)
    setCreateReport(null)
    setActivateReport(null)
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    reset()
    setFileName(file.name)
    setReading(true)
    try {
      // Lazy-load SheetJS only when importing — keeps it out of the initial bundle.
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) {
        setError('الملف لا يحتوي ورقة بيانات.')
        return
      }

      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as unknown[][]
      if (aoa.length < 1) {
        setError('لا توجد بيانات صالحة في الملف.')
        return
      }

      const headers = (aoa[0] ?? []).map(normalizeHeader)
      const colField = headers.map((h) => HEADER_MAP[h] ?? null)
      if (
        !colField.includes('selfId') ||
        !colField.includes('fullName') ||
        !colField.includes('phone')
      ) {
        setError(
          'تأكّد من استخدام القالب الصحيح (أعمدة «الرقم الوظيفي» و«الاسم الكامل» و«رقم الهاتف» مطلوبة).',
        )
        return
      }

      const items: BulkEmployeeItem[] = []
      for (let r = 1; r < aoa.length; r++) {
        const cells = aoa[r] ?? []
        const item: Partial<BulkEmployeeItem> = {}
        let hasAny = false
        for (let c = 0; c < colField.length; c++) {
          const field = colField[c]
          if (!field) continue
          const value = String(cells[c] ?? '').trim()
          if (!value) continue
          hasAny = true
          if (field === 'personnelType') {
            item.personnelType =
              value === 'عسكري'
                ? 'military'
                : value === 'مدني'
                  ? 'civilian'
                  : (value as 'civilian' | 'military')
          } else {
            ;(item as Record<string, unknown>)[field] = value
          }
        }
        if (!hasAny) continue // skip fully empty rows
        items.push(item as BulkEmployeeItem)
      }

      if (items.length === 0) {
        setError('لا توجد بيانات صالحة في الملف.')
        return
      }
      setRows(items)
    } catch {
      setError('تعذّرت قراءة الملف. تأكّد أنه ملف Excel (.xlsx) صحيح.')
    } finally {
      setReading(false)
    }
  }

  async function handleImport() {
    if (!rows) return
    setError(null)
    setImporting(true)
    setCreateReport(null)
    setActivateReport(null)
    try {
      const report = await bulkCreateEmployees(rows)
      setCreateReport(report)
      if (report.created > 0) onChanged()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleActivateAll() {
    if (!createReport || createReport.createdItems.length === 0) return
    setError(null)
    setActivating(true)
    setActivateReport(null)
    try {
      const selfIds = createReport.createdItems.map((c) => c.selfId)
      const report = await bulkActivateEmployees(selfIds)
      setActivateReport(report)
      onChanged()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setActivating(false)
    }
  }

  const busy = reading || importing || activating
  const preview = rows ? rows.slice(0, PREVIEW_ROWS) : []

  return (
    <div className="emp-section">
      <h2 className="emp-heading">استيراد من Excel</h2>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        className="btn btn-secondary"
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {reading ? 'جارٍ القراءة…' : 'رفع ملف Excel'}
      </button>

      {fileName && !reading && <p className="field-hint">الملف: {fileName}</p>}

      {error && <div className="test-result test-error">{error}</div>}

      {rows && (
        <>
          <p className="qr-hint">
            تمّت قراءة {rows.length} صفّاً. معاينة أول {preview.length}:
          </p>
          <div className="log-list">
            {preview.map((it, i) => (
              <div key={i} className="log-row">
                <div className="log-row-head">
                  <span className="log-name">{it.fullName || '—'}</span>
                  <span className="badge badge-pending">
                    {it.personnelType === 'military'
                      ? 'عسكري'
                      : it.personnelType === 'civilian'
                        ? 'مدني'
                        : it.personnelType || '—'}
                  </span>
                </div>
                <div className="log-row-meta">
                  <span>{it.selfId || '—'}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-scan"
            type="button"
            onClick={() => void handleImport()}
            disabled={busy}
          >
            {importing ? 'جارٍ الاستيراد…' : `استيراد ${rows.length} موظف`}
          </button>
        </>
      )}

      {createReport && (
        <div className="emp-section">
          <div className="test-result test-ok">
            تم إنشاء {createReport.created} موظف بنجاح.
          </div>

          {createReport.failed.length > 0 && (
            <>
              <p className="qr-hint">صفوف فشلت ({createReport.failed.length}):</p>
              <div className="log-list">
                {createReport.failed.map((f, i) => (
                  <div key={i} className="log-row log-row-red">
                    <div className="log-row-head">
                      <span className="log-name">
                        {f.selfId ?? '—'}
                      </span>
                      <span className="badge badge-error">صفّ {f.index + 1}</span>
                    </div>
                    <div className="log-reason">{f.reason}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void handleActivateAll()}
            disabled={busy || createReport.createdItems.length === 0}
          >
            {activating
              ? 'جارٍ التفعيل…'
              : `تفعيل كل المستوردين (${createReport.createdItems.length})`}
          </button>
        </div>
      )}

      {activateReport && (
        <div className="test-result test-ok">
          تم تفعيل {activateReport.activated} موظف.
          {activateReport.failed.length > 0 &&
            ` — فشل ${activateReport.failed.length}: ${activateReport.failed
              .map((f) => `${f.selfId} (${f.reason})`)
              .join('، ')}`}
        </div>
      )}
    </div>
  )
}
