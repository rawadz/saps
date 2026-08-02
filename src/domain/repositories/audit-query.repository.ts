/**
 * Read side of the audit trail — the gate-movement report (part 5a). The Domain
 * owns this contract; the Data layer implements it with the joins that resolve a
 * display NAME per subject.
 *
 * SECURITY: this side is strictly READ-ONLY (audit_logs is append-only) and exposes
 * NAMES only — never the self id, national id, phone, or any token. The employee
 * reference stays a keyed hash; the name is recovered by joining that hash to
 * employees.self_id_search_hash, so nothing sensitive is ever reversed or returned.
 */

/** Filter + paging for the gate-movement query. The use-case validates/clamps these. */
export interface GateLogFilter {
  from?: Date; // inclusive lower bound on created_at
  to?: Date; // inclusive upper bound on created_at
  gateName?: string; // exact gate match
  result?: 'GREEN' | 'RED'; // display vocabulary; mapped to success/failure in the data layer
  page: number; // 1-based, already normalized by the use-case
  pageSize: number; // already clamped to the hard maximum by the use-case
}

/** One row of the gate-movement report. Names are resolved at read time via joins. */
export interface GateLogRow {
  id: string;
  occurredAt: Date; // audit_logs.created_at (server-set)
  gateName: string | null;
  result: 'GREEN' | 'RED'; // mapped from the stored success/failure
  reason: string | null; // denial reason for a RED row (e.g. BANNED, EXPIRED)
  subjectType: 'employee' | 'permit' | 'vehicle' | null;
  subjectName: string | null; // employee full_name | visitor_name | vehicle plate_number
  subjectOwnerName: string | null; // vehicle rows only: the owner employee/visitor name
  guardName: string | null; // users.full_name of the acting guard
}

/** A bounded page of gate-movement rows plus the total matching the filter. */
export interface GateLogPage {
  items: GateLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Aggregated gate-scan counters for one day (part 5b). Every count covers ONLY real
 * gate scans (entry_check_approved/denied) on/after the given day start — the
 * administrative ban/unban events are excluded.
 *
 * NOTE: an accurate "currently present" figure is deliberately NOT here — true
 * presence needs entry/exit direction the system does not record yet. `visitorEntries`
 * is a today-counter of approved visitor-permit scans, not a live presence count.
 */
export interface DailyStats {
  totalScans: number; // all scans today (approved + denied)
  approved: number; // result = success
  denied: number; // result = failure
  visitorEntries: number; // approved scans with subject_type = permit
  vehicleEntries: number; // approved scans with subject_type = vehicle
}

export interface AuditQueryRepository {
  /** Filtered, paginated, name-resolved gate scans. Reads only — never writes. */
  queryGateLog(filter: GateLogFilter): Promise<GateLogPage>;

  /** Aggregated gate-scan counters for the current day (on/after dayStart). Read only. */
  dailyStats(dayStart: Date): Promise<DailyStats>;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const AUDIT_QUERY_REPOSITORY = Symbol('AuditQueryRepository');
