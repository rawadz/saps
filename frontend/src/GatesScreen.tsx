import { useEffect, useState, type FormEvent } from 'react'
import OfficialHeader from './OfficialHeader'
import {
  ApiError,
  createGate,
  describeApiError,
  getGatesList,
  updateGate,
  type GateDirection,
  type GateListItem,
} from './api'

// Arabic labels for the three gate directions.
const DIR_AR: Record<GateDirection, string> = {
  in: 'دخول',
  out: 'خروج',
  both: 'دخول وخروج',
}

interface Msg {
  ok: boolean
  text: string
}

type DirState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: GateListItem[] }
  | { phase: 'error'; message: string }

/** Map a /gates failure to a clear Arabic message (stable codes first). */
function gateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'GATE_NAME_TAKEN' || err.status === 409) {
      return 'اسم البوابة مُستخدَم بالفعل.'
    }
    if (err.code === 'GATE_NAME_REQUIRED') return 'اسم البوابة مطلوب.'
    if (err.code === 'INVALID_GATE_DIRECTION') return 'اتجاه البوابة غير صالح.'
    if (err.code === 'GATE_NOT_FOUND' || err.status === 404) {
      return 'البوابة غير موجودة.'
    }
    if (err.code === 'FORBIDDEN_GATE' || err.status === 403) {
      return 'لا تملك صلاحية إدارة البوابات.'
    }
    if (err.status === 400) return 'بيانات غير صالحة — تحقّق من الحقول.'
  }
  return describeApiError(err)
}

export default function GatesScreen() {
  // ── Create form ──
  const [name, setName] = useState('')
  const [direction, setDirection] = useState<GateDirection>('both')
  const [supportsVehicles, setSupportsVehicles] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<Msg | null>(null)

  // ── Directory (live list from the backend — a bare array, no pagination) ──
  const [dir, setDir] = useState<DirState>({ phase: 'loading' })
  // Success messages tied to the list (e.g. after a successful edit + close).
  const [dirMsg, setDirMsg] = useState<Msg | null>(null)

  // ── Edit panel (opens when a gate row is selected) ──
  const [editTarget, setEditTarget] = useState<GateListItem | null>(null)
  const [eName, setEName] = useState('')
  const [eDirection, setEDirection] = useState<GateDirection>('both')
  const [eSupportsVehicles, setESupportsVehicles] = useState(false)
  const [eIsActive, setEIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMsg, setEditMsg] = useState<Msg | null>(null)

  // Load the full gate list. Failures surface as an error phase.
  async function loadGates() {
    setDir({ phase: 'loading' })
    try {
      const data = await getGatesList()
      setDir({ phase: 'ok', data })
    } catch (err) {
      setDir({ phase: 'error', message: gateError(err) })
    }
  }

  // Initial load on mount.
  useEffect(() => {
    void loadGates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreateMsg(null)
    const n = name.trim()
    if (n.length === 0) {
      setCreateMsg({ ok: false, text: 'اسم البوابة مطلوب.' })
      return
    }
    setCreating(true)
    try {
      const gate = await createGate({ name: n, direction, supportsVehicles })
      setCreateMsg({ ok: true, text: `تمت إضافة البوابة: ${gate.name}.` })
      // Reset the form (keep direction/vehicles defaults for the next entry).
      setName('')
      setDirection('both')
      setSupportsVehicles(false)
      void loadGates()
    } catch (err) {
      setCreateMsg({ ok: false, text: gateError(err) })
    } finally {
      setCreating(false)
    }
  }

  // Click a row → open the edit panel prefilled with that gate's current values.
  function selectGate(g: GateListItem) {
    setEditTarget(g)
    setEName(g.name)
    setEDirection(g.direction)
    setESupportsVehicles(g.supportsVehicles)
    setEIsActive(g.isActive)
    setEditMsg(null)
  }

  function cancelEdit() {
    setEditTarget(null)
    setEditMsg(null)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditMsg(null)
    const n = eName.trim()
    if (n.length === 0) {
      setEditMsg({ ok: false, text: 'اسم البوابة مطلوب.' })
      return
    }
    setSaving(true)
    try {
      const gate = await updateGate(editTarget.id, {
        name: n,
        direction: eDirection,
        supportsVehicles: eSupportsVehicles,
        isActive: eIsActive, // this is the activate / deactivate toggle
      })
      // Close the panel and surface success near the list.
      setEditTarget(null)
      setDirMsg({ ok: true, text: `تم حفظ تعديل البوابة: ${gate.name}.` })
      void loadGates()
    } catch (err) {
      // Keep the panel open so the user can correct and retry.
      setEditMsg({ ok: false, text: gateError(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app">
      <main className="card employees-card">
        <OfficialHeader />
        <p className="subtitle">إدارة البوابات</p>

        {/* ── Create a gate ─────────────────────────────────────────── */}
        <form className="form" onSubmit={handleCreate}>
          <h2 className="emp-heading">إضافة بوابة</h2>

          <label className="field">
            <span className="label">اسم البوابة *</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              disabled={creating}
            />
          </label>

          <label className="field">
            <span className="label">الاتجاه *</span>
            <select
              className="input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as GateDirection)}
              disabled={creating}
            >
              <option value="in">دخول</option>
              <option value="out">خروج</option>
              <option value="both">دخول وخروج</option>
            </select>
          </label>

          <label className="field">
            <span className="label">دعم المركبات</span>
            <select
              className="input"
              value={supportsVehicles ? 'yes' : 'no'}
              onChange={(e) => setSupportsVehicles(e.target.value === 'yes')}
              disabled={creating}
            >
              <option value="no">لا</option>
              <option value="yes">نعم</option>
            </select>
          </label>

          {createMsg && (
            <div
              className={`test-result ${createMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {createMsg.text}
            </div>
          )}

          <button className="btn btn-scan" type="submit" disabled={creating}>
            {creating ? 'جارٍ الإضافة…' : 'إضافة بوابة'}
          </button>
        </form>

        {/* ── Gate directory (live, from the backend) ───────────────── */}
        <div className="emp-section">
          <h2 className="emp-heading">قائمة البوابات</h2>

          {dirMsg && (
            <div
              className={`test-result ${dirMsg.ok ? 'test-ok' : 'test-error'}`}
            >
              {dirMsg.text}
            </div>
          )}

          {dir.phase === 'loading' && (
            <p className="log-empty">جارٍ تحميل القائمة…</p>
          )}

          {dir.phase === 'error' && (
            <div className="test-result test-error">{dir.message}</div>
          )}

          {dir.phase === 'ok' && dir.data.length === 0 && (
            <p className="log-empty">لا توجد بوابات.</p>
          )}

          {dir.phase === 'ok' && dir.data.length > 0 && (
            <div className="log-list">
              {dir.data.map((g) => (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  className={`log-row emp-dir-row ${
                    editTarget?.id === g.id ? 'emp-dir-selected' : ''
                  }`}
                  onClick={() => selectGate(g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      selectGate(g)
                    }
                  }}
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
                    {`الاتجاه: ${DIR_AR[g.direction]} • المركبات: ${
                      g.supportsVehicles ? 'نعم' : 'لا'
                    }`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Edit panel (click a gate above to open it) ────────────── */}
        {editTarget && (
          <form className="emp-section" onSubmit={handleSave}>
            <h2 className="emp-heading">تعديل البوابة</h2>

            <label className="field">
              <span className="label">اسم البوابة *</span>
              <input
                className="input"
                value={eName}
                onChange={(e) => setEName(e.target.value)}
                autoComplete="off"
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="label">الاتجاه *</span>
              <select
                className="input"
                value={eDirection}
                onChange={(e) => setEDirection(e.target.value as GateDirection)}
                disabled={saving}
              >
                <option value="in">دخول</option>
                <option value="out">خروج</option>
                <option value="both">دخول وخروج</option>
              </select>
            </label>

            <label className="field">
              <span className="label">دعم المركبات</span>
              <select
                className="input"
                value={eSupportsVehicles ? 'yes' : 'no'}
                onChange={(e) => setESupportsVehicles(e.target.value === 'yes')}
                disabled={saving}
              >
                <option value="no">لا</option>
                <option value="yes">نعم</option>
              </select>
            </label>

            <label className="field">
              <span className="label">الحالة</span>
              <select
                className="input"
                value={eIsActive ? 'yes' : 'no'}
                onChange={(e) => setEIsActive(e.target.value === 'yes')}
                disabled={saving}
              >
                <option value="yes">مفعّلة</option>
                <option value="no">معطّلة</option>
              </select>
            </label>

            {editMsg && (
              <div
                className={`test-result ${editMsg.ok ? 'test-ok' : 'test-error'}`}
              >
                {editMsg.text}
              </div>
            )}

            <div className="emp-actions">
              <button className="btn btn-scan" type="submit" disabled={saving}>
                {saving ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={cancelEdit}
                disabled={saving}
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
