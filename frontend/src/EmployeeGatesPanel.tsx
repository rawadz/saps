import { useEffect, useState } from 'react'
import {
  ApiError,
  assignEmployeeGates,
  describeApiError,
  getEmployeeGates,
  getGatesList,
  type GateDirection,
  type GateListItem,
} from './api'

// Arabic labels for the three gate directions (same mapping as GatesScreen).
const DIR_AR: Record<GateDirection, string> = {
  in: 'دخول',
  out: 'خروج',
  both: 'دخول وخروج',
}

interface EmployeeGatesPanelProps {
  selfId: string
}

// Opening the panel is a double-fetch (full gate directory + this employee's grants);
// model it as a discriminated union like the other screens.
type Phase =
  | { phase: 'idle' } // closed, not opened yet
  | { phase: 'loading' }
  | { phase: 'ok'; allGates: GateListItem[]; granted: Set<string> }
  | { phase: 'error'; message: string }

/** Map a gate-access failure to a clear Arabic message (stable codes first). */
function gateErr(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GATE_NOT_FOUND') return 'إحدى البوابات غير موجودة.'
    if (err.code === 'EMPLOYEE_NOT_FOUND') return 'الموظف غير موجود.'
    if (err.status === 403) return 'لا تملك صلاحية لإدارة بوابات الموظف.'
    if (err.status === 404) return 'الموظف غير موجود.'
  }
  return describeApiError(err)
}

/**
 * Assign the set of gates an employee may pass. Self-contained: it fetches the full
 * gate directory + the employee's current grants, lets a leader toggle the set, and
 * PUTs a full replacement. Mirrors the barcode panel's open / close / reset pattern.
 */
export default function EmployeeGatesPanel({ selfId }: EmployeeGatesPanelProps) {
  const [state, setState] = useState<Phase>({ phase: 'idle' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // Reset when the targeted employee changes — never carry one employee's gates over
  // to another (mirrors the barcode panel's reset on actionSelfId).
  useEffect(() => {
    setState({ phase: 'idle' })
    setSaveError(null)
    setSaveOk(false)
  }, [selfId])

  async function load() {
    setSaveError(null)
    setSaveOk(false)
    setState({ phase: 'loading' })
    try {
      const [allGates, grantedRows] = await Promise.all([
        getGatesList(),
        getEmployeeGates(selfId),
      ])
      const granted = new Set(grantedRows.map((r) => r.gateId))
      setState({ phase: 'ok', allGates, granted })
    } catch (err) {
      setState({ phase: 'error', message: gateErr(err) })
    }
  }

  // Toggle a gate's membership — copy the Set so we never mutate state in place.
  function toggle(gateId: string) {
    setSaveOk(false)
    setState((s) => {
      if (s.phase !== 'ok') return s
      const granted = new Set(s.granted)
      if (granted.has(gateId)) granted.delete(gateId)
      else granted.add(gateId)
      return { ...s, granted }
    })
  }

  async function save() {
    if (state.phase !== 'ok') return
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      // Full replace: the current Set IS the authorised set after the operation.
      await assignEmployeeGates(selfId, [...state.granted])
      setSaveOk(true)
    } catch (err) {
      setSaveError(gateErr(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="service-block">
      <h3 className="emp-heading">بوابات الموظف</h3>

      {state.phase === 'idle' && (
        <div className="emp-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void load()}
          >
            عرض/تعديل البوابات
          </button>
        </div>
      )}

      {state.phase === 'loading' && <p className="log-empty">جارٍ التحميل…</p>}

      {state.phase === 'error' && (
        <>
          <div className="test-result test-error">{state.message}</div>
          <div className="emp-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void load()}
            >
              إعادة المحاولة
            </button>
          </div>
        </>
      )}

      {state.phase === 'ok' && (
        <>
          {state.allGates.length === 0 ? (
            <p className="log-empty">لا توجد بوابات معرّفة.</p>
          ) : (
            <div className="log-list">
              {state.allGates.map((g) => {
                const selected = state.granted.has(g.id)
                // An inactive gate that is NOT already granted is locked: a disabled
                // gate cannot be newly granted from the UI. An inactive-but-granted
                // gate stays clickable to REMOVE it, so a save never silently drops it.
                const locked = !g.isActive && !selected
                return (
                  <div
                    key={g.id}
                    role={locked ? undefined : 'button'}
                    tabIndex={locked ? undefined : 0}
                    aria-disabled={locked || undefined}
                    className={`log-row emp-dir-row ${
                      selected ? 'emp-dir-selected' : ''
                    }`}
                    style={
                      locked
                        ? { opacity: 0.5, cursor: 'not-allowed' }
                        : undefined
                    }
                    onClick={locked ? undefined : () => toggle(g.id)}
                    onKeyDown={
                      locked
                        ? undefined
                        : (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggle(g.id)
                            }
                          }
                    }
                  >
                    <div className="log-row-head">
                      <span className="log-name">{g.name}</span>
                      <span
                        className={`badge ${
                          g.isActive ? 'badge-ok' : 'badge-pending'
                        }`}
                      >
                        {g.isActive ? 'مفعّلة' : 'معطّلة'}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      {`الاتجاه: ${DIR_AR[g.direction]}${
                        selected ? ' • مصرّح بها' : ''
                      }`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {saveError && (
            <div className="test-result test-error">{saveError}</div>
          )}
          {saveOk && (
            <div className="test-result test-ok">تم حفظ بوابات الموظف.</div>
          )}

          <div className="emp-actions">
            <button
              type="button"
              className="btn btn-scan"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setState({ phase: 'idle' })}
              disabled={saving}
            >
              إغلاق
            </button>
          </div>
        </>
      )}
    </div>
  )
}
