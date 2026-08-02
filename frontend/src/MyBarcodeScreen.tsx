import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { describeApiError, getMyBarcode, getMyProfile } from './api'
import OfficialHeader from './OfficialHeader'
import BarcodeActions from './BarcodeActions'

interface MyBarcodeScreenProps {
  onLogout: () => void
}

type ScreenState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'no-barcode' }
  | {
      phase: 'ok'
      barcode: string
      fullName: string | null
      selfId: string | null
      department: string | null
    }

export default function MyBarcodeScreen({ onLogout }: MyBarcodeScreenProps) {
  const [state, setState] = useState<ScreenState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // The barcode is the source of truth (the proven /me/barcode endpoint).
        const { barcode } = await getMyBarcode()

        // Name + id are a best-effort enrichment for the ID-card look; if the
        // profile lookup fails we still show the QR.
        let fullName: string | null = null
        let selfId: string | null = null
        let department: string | null = null
        try {
          const profile = await getMyProfile()
          fullName = profile.fullName
          selfId = profile.selfId
          department = profile.commandDepartment
        } catch {
          /* ignore — the QR does not depend on the profile */
        }

        if (cancelled) return
        setState(
          barcode
            ? { phase: 'ok', barcode, fullName, selfId, department }
            : { phase: 'no-barcode' },
        )
      } catch (err) {
        if (!cancelled) {
          setState({ phase: 'error', message: describeApiError(err) })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      <main className="card barcode-card">
        <OfficialHeader />
        <div className="scan-header">
          <h1 className="title scan-title">باركودي</h1>
          <button type="button" className="logout-link" onClick={onLogout}>
            خروج
          </button>
        </div>

        {state.phase === 'loading' && (
          <p className="welcome">جارٍ تحميل الباركود…</p>
        )}

        {state.phase === 'error' && (
          <div className="form-error">{state.message}</div>
        )}

        {state.phase === 'no-barcode' && (
          <div className="form-error">
            لا يوجد باركود لهذا الحساب — قد يكون غير مُفعّل.
          </div>
        )}

        {state.phase === 'ok' && (
          <>
            <div className="qr-frame">
              <QRCodeSVG
                value={state.barcode}
                size={224}
                level="M"
                bgColor="#ffffff"
                fgColor="#0f172a"
              />
            </div>

            <div className="id-card">
              {state.fullName && <div className="id-name">{state.fullName}</div>}
              {state.selfId && <div className="id-number">{state.selfId}</div>}
              {state.department && (
                <div className="id-dept">{state.department}</div>
              )}
            </div>

            <p className="qr-hint">قدّم هذا الرمز للحارس لمسحه</p>

            <BarcodeActions
              value={state.barcode}
              label={
                [state.fullName, state.selfId].filter(Boolean).join(' — ') ||
                undefined
              }
              fileBase={`barcode_${state.selfId ?? 'employee'}`}
            />
          </>
        )}
      </main>
    </div>
  )
}
