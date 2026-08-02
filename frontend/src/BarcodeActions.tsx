import { useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

interface BarcodeActionsProps {
  /** The QR token to encode. */
  value: string
  /** Optional caption drawn under the QR in the exported image (name / id / number). */
  label?: string
  /** Filename base (no extension), e.g. 'barcode_EMP-20001' or 'permit_VP-XXXX'. */
  fileBase: string
}

// High-res source QR (px) + quiet-zone modules — clear for print and scanning.
const QR_SIZE = 700
const QR_MARGIN = 4
const PAD = 48 // extra white border around the QR (px)
const LABEL_H = 64 // caption strip height (px)

// Detect file-sharing support ONCE (stable per device). A dummy file lets us probe
// navigator.canShare({ files }) precisely instead of merely feature-sniffing.
function detectFileShare(): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare) return false
    const probe = new File(['x'], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}
const CAN_SHARE_FILES = detectFileShare()

export default function BarcodeActions({
  value,
  label,
  fileBase,
}: BarcodeActionsProps) {
  // Wrap the hidden canvas and read it via querySelector — independent of how
  // qrcode.react forwards refs across versions.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'download' | 'share' | ''>('')
  const [msg, setMsg] = useState<string | null>(null)

  // Compose the hidden QR canvas onto a white, padded, captioned PNG.
  async function buildBlob(): Promise<Blob> {
    const src = wrapRef.current?.querySelector('canvas')
    if (!src) throw new Error('QR_NOT_READY')

    const labelH = label ? LABEL_H : 0
    const canvas = document.createElement('canvas')
    canvas.width = src.width + PAD * 2
    canvas.height = src.height + PAD * 2 + labelH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('NO_2D_CONTEXT')

    // White background — best for printing and for scanner contrast.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(src, PAD, PAD)

    if (label) {
      // Make sure the UI font is loaded so the Arabic caption shapes correctly.
      try {
        await document.fonts.ready
      } catch {
        /* Font Loading API unavailable — fall back to the default font */
      }
      ctx.fillStyle = '#0f172a'
      ctx.font = "600 28px Tajawal, 'Segoe UI', Arial, sans-serif"
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.direction = 'rtl'
      ctx.fillText(
        label,
        canvas.width / 2,
        src.height + PAD + labelH / 2,
        canvas.width - PAD,
      )
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('TOBLOB_FAILED'))),
        'image/png',
      )
    })
  }

  async function handleDownload() {
    setMsg(null)
    setBusy('download')
    try {
      const blob = await buildBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileBase}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setMsg('تعذّر توليد صورة الباركود. حاول مرة أخرى.')
    } finally {
      setBusy('')
    }
  }

  async function handleShare() {
    setMsg(null)
    setBusy('share')
    try {
      const blob = await buildBlob()
      const file = new File([blob], `${fileBase}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'الباركود' })
      } else {
        setMsg('المشاركة غير مدعومة على هذا الجهاز — استخدم التنزيل.')
      }
    } catch (err) {
      // Dismissing the share sheet throws AbortError — not a real failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setMsg('تعذّرت المشاركة. استخدم التنزيل بدلاً منها.')
      }
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      {/* Hidden high-res source canvas (white bg + quiet zone) for the export. */}
      <div ref={wrapRef} style={{ display: 'none' }} aria-hidden="true">
        <QRCodeCanvas
          value={value}
          size={QR_SIZE}
          marginSize={QR_MARGIN}
          level="M"
          bgColor="#ffffff"
          fgColor="#0f172a"
        />
      </div>

      <div className="emp-actions">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => void handleDownload()}
          disabled={busy !== ''}
        >
          {busy === 'download' ? 'جارٍ التوليد…' : 'تنزيل الباركود'}
        </button>
        {CAN_SHARE_FILES && (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void handleShare()}
            disabled={busy !== ''}
          >
            {busy === 'share' ? 'جارٍ المشاركة…' : 'مشاركة'}
          </button>
        )}
      </div>

      {msg && <div className="test-result test-error">{msg}</div>}
    </>
  )
}
