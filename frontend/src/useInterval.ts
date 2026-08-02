import { useEffect, useRef } from 'react'

/**
 * Runs `callback` every `delayMs` WITHOUT restarting the timer when `callback`
 * changes — the interval is created once and cleared on unmount. Each tick invokes
 * the latest callback via a ref, so it always sees the current state/closure
 * (current page, filters, search) without re-creating the timer on every render.
 * Pass `delayMs = null` to pause.
 *
 * (Dan Abramov's useInterval pattern.)
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const saved = useRef(callback)

  // Keep the ref pointing at the latest callback on every render.
  useEffect(() => {
    saved.current = callback
  })

  // Create the interval once (or when the delay changes); clear it on unmount.
  useEffect(() => {
    if (delayMs === null) return
    const id = setInterval(() => saved.current(), delayMs)
    return () => clearInterval(id)
  }, [delayMs])
}
