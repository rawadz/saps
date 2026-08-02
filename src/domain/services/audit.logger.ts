export type AuditSubjectType = 'employee' | 'permit' | 'vehicle';

/**
 * One append-only audit event. The timestamp is set server-side by the
 * implementation. Per the logging rules, this MUST NOT carry the plaintext
 * national id, phone, employee id, token or any secret — for an `employee`
 * subject the implementation stores a non-reversible hash of `subjectRef`.
 */
export interface AuditEntry {
  type: string; // e.g. entry_check_approved, entry_check_denied, entry_block, entry_unblock
  subjectType: AuditSubjectType;
  subjectRef: string; // employee self id (stored hashed) or permit number
  actorUserId?: string; // the acting user's id (e.g. the guard) — a users.id FK
  gateName?: string;
  /** Optional UUID of the gate this scan was bound to (guard's pinned station). */
  gateId?: string;
  result: 'success' | 'failure';
  reason?: string;
}

export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_LOGGER = Symbol('AuditLogger');
