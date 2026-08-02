import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import {
  AuditQueryRepository,
  AUDIT_QUERY_REPOSITORY,
  DailyStats,
} from '../repositories/audit-query.repository';

/** Only these administrative roles may read the audit reports. */
const REPORT_ROLES: Role[] = [
  'super_admin',
  'branch_head',
  'supervisor',
  'department_manager',
  'hr_head',
  'hr',
];

export interface GetDailyStatsInput {
  actingRole: Role;
}

/**
 * Daily gate statistics (part 5b): five aggregate counters for the CURRENT calendar
 * day (server-local), from midnight until now. READ-ONLY — audit_logs is never
 * written. Authorization is enforced here too (defense in depth with the RolesGuard).
 *
 * NOTE: an accurate "currently present" figure is intentionally OUT OF SCOPE — it
 * needs entry/exit direction the system does not record yet. `visitorEntries` is a
 * today-counter of APPROVED visitor-permit scans, not a live presence count.
 */
@Injectable()
export class GetDailyStatsUseCase {
  constructor(
    @Inject(AUDIT_QUERY_REPOSITORY)
    private readonly auditQuery: AuditQueryRepository,
  ) {}

  async execute(input: GetDailyStatsInput): Promise<DailyStats> {
    if (!REPORT_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_VIEW_REPORTS');
    }
    return this.auditQuery.dailyStats(this.startOfToday());
  }

  /** Midnight that begins the current day, in the server's local time zone. */
  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
