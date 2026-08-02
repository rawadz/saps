/**
 * Contract for a guard's currently-bound gate (their physical station). The gate
 * is resolved SERVER-SIDE from the authenticated guard's context — never trusted
 * from the scan request body — so a guard cannot spoof another gate. Backed by a
 * dedicated store (separate from the active-session record) and resolved live at
 * scan time. The barcode itself stays an HMAC-signed id; the gate is guard context.
 */
export interface GuardGateService {
  /** Bind (or re-bind) the gate this guard's station represents. Overwrites any prior binding. */
  setGuardGate(guardUserId: string, gateId: string): Promise<void>;

  /** Resolve the guard's currently-bound gate id, or null if none is set yet. */
  getGuardGate(guardUserId: string): Promise<string | null>;

  /** Remove the guard's gate binding (e.g. on logout / shift end). */
  clear(guardUserId: string): Promise<void>;
}

// Injection token — a Symbol so the Domain need not import NestJS.
export const GUARD_GATE_SERVICE = Symbol('GuardGateService');
