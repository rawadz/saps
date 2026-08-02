import { Injectable } from '@nestjs/common';
import {
  AuditQueryRepository,
  DailyStats,
  GateLogFilter,
  GateLogPage,
  GateLogRow,
} from '../../domain/repositories/audit-query.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/** Raw row shape produced by the joined SELECT (aliases are quoted in the SQL). */
interface RawGateLogRow {
  id: string;
  occurredAt: Date;
  gateName: string | null;
  result: string; // 'success' | 'failure'
  reason: string | null;
  subjectType: 'employee' | 'permit' | 'vehicle' | null;
  subjectName: string | null;
  subjectOwnerName: string | null;
  guardName: string | null;
}

/**
 * Prisma implementation of the read-only gate-movement query.
 *
 * SECURITY:
 *  - READ ONLY. It never writes to audit_logs (the table is append-only).
 *  - It returns NAMES resolved via joins, never a self/national id, phone or token.
 *    The employee name is found by matching audit_logs.subject_ref to
 *    employees.self_id_search_hash — the SAME keyed hash stored in the log — so the
 *    hashed reference is never reversed and no sensitive id leaves the database.
 *  - The SQL is a FIXED string. Every user-supplied value is a BOUND parameter
 *    ($1..$6), never concatenated, so it is injection-safe despite $queryRawUnsafe
 *    (which only means "the query text is author-provided", not "values are raw").
 *
 * Only real gate scans (entry_check_approved / entry_check_denied) are movements;
 * the administrative entry_block / entry_unblock events are intentionally excluded.
 */
@Injectable()
export class PrismaAuditQueryRepository implements AuditQueryRepository {
  private static readonly SELECT_SQL = `
    SELECT
      a.id,
      a.created_at   AS "occurredAt",
      a.gate_name    AS "gateName",
      a.result,
      a.reason,
      a.subject_type AS "subjectType",
      CASE a.subject_type
        WHEN 'employee' THEN e.full_name
        WHEN 'permit'   THEN p.visitor_name
        WHEN 'vehicle'  THEN v.plate_number
      END AS "subjectName",
      CASE
        WHEN a.subject_type = 'vehicle'
          THEN COALESCE(ve.full_name, vp.visitor_name)
        ELSE NULL
      END AS "subjectOwnerName",
      u.full_name AS "guardName"
    FROM audit_logs a
    LEFT JOIN employees e
      ON a.subject_type = 'employee' AND a.subject_ref = e.self_id_search_hash
    LEFT JOIN permits p
      ON a.subject_type = 'permit' AND a.subject_ref = p.permit_number
    LEFT JOIN vehicle_permits v
      ON a.subject_type = 'vehicle' AND a.subject_ref = v.id::text
    LEFT JOIN employees ve ON v.employee_id = ve.id
    LEFT JOIN permits   vp ON v.visitor_permit_id = vp.id
    LEFT JOIN users u ON a.actor_user_id = u.id
    WHERE a.type IN ('entry_check_approved', 'entry_check_denied')
      AND ($1::timestamptz IS NULL OR a.created_at >= $1)
      AND ($2::timestamptz IS NULL OR a.created_at <= $2)
      AND ($3::text IS NULL OR a.gate_name = $3)
      AND ($4::text IS NULL OR a.result = $4)
    ORDER BY a.created_at DESC
    LIMIT $5 OFFSET $6
  `;

  private static readonly COUNT_SQL = `
    SELECT COUNT(*)::int AS count
    FROM audit_logs a
    WHERE a.type IN ('entry_check_approved', 'entry_check_denied')
      AND ($1::timestamptz IS NULL OR a.created_at >= $1)
      AND ($2::timestamptz IS NULL OR a.created_at <= $2)
      AND ($3::text IS NULL OR a.gate_name = $3)
      AND ($4::text IS NULL OR a.result = $4)
  `;

  // All five daily counters in ONE scan via aggregate FILTER. $1 = start of day.
  private static readonly STATS_SQL = `
    SELECT
      COUNT(*)::int AS "totalScans",
      COUNT(*) FILTER (WHERE a.result = 'success')::int AS "approved",
      COUNT(*) FILTER (WHERE a.result = 'failure')::int AS "denied",
      COUNT(*) FILTER (
        WHERE a.result = 'success' AND a.subject_type = 'permit'
      )::int AS "visitorEntries",
      COUNT(*) FILTER (
        WHERE a.result = 'success' AND a.subject_type = 'vehicle'
      )::int AS "vehicleEntries"
    FROM audit_logs a
    WHERE a.type IN ('entry_check_approved', 'entry_check_denied')
      AND a.created_at >= $1::timestamptz
  `;

  constructor(private readonly prisma: PrismaService) {}

  async queryGateLog(filter: GateLogFilter): Promise<GateLogPage> {
    const from = filter.from ?? null;
    const to = filter.to ?? null;
    const gateName = filter.gateName ?? null;
    // Translate the display vocabulary (GREEN/RED) to the stored result values.
    const resultDb =
      filter.result === 'GREEN'
        ? 'success'
        : filter.result === 'RED'
          ? 'failure'
          : null;
    const limit = filter.pageSize;
    const offset = (filter.page - 1) * filter.pageSize;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<RawGateLogRow[]>(
        PrismaAuditQueryRepository.SELECT_SQL,
        from,
        to,
        gateName,
        resultDb,
        limit,
        offset,
      ),
      this.prisma.$queryRawUnsafe<{ count: number }[]>(
        PrismaAuditQueryRepository.COUNT_SQL,
        from,
        to,
        gateName,
        resultDb,
      ),
    ]);

    const items: GateLogRow[] = rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      gateName: r.gateName,
      // success -> GREEN, anything else (failure) -> RED.
      result: r.result === 'success' ? 'GREEN' : 'RED',
      reason: r.reason,
      subjectType: r.subjectType,
      subjectName: r.subjectName,
      subjectOwnerName: r.subjectOwnerName,
      guardName: r.guardName,
    }));

    return {
      items,
      page: filter.page,
      pageSize: filter.pageSize,
      total: countRows[0]?.count ?? 0,
    };
  }

  async dailyStats(dayStart: Date): Promise<DailyStats> {
    // Single parameterized scan; the day start ($1) is a BOUND parameter, never
    // concatenated. The aggregate FILTER yields exactly one row.
    const rows = await this.prisma.$queryRawUnsafe<DailyStats[]>(
      PrismaAuditQueryRepository.STATS_SQL,
      dayStart,
    );
    return (
      rows[0] ?? {
        totalScans: 0,
        approved: 0,
        denied: 0,
        visitorEntries: 0,
        vehicleEntries: 0,
      }
    );
  }
}
