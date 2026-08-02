import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Role } from '../auth/role';
import {
  AuditQueryRepository,
  AUDIT_QUERY_REPOSITORY,
  GateLogPage,
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

export interface GetGateLogInput {
  actingRole: Role;
  from?: string; // ISO 8601 date/datetime
  to?: string; // ISO 8601 date/datetime
  gateName?: string;
  result?: 'GREEN' | 'RED';
  page?: number;
  pageSize?: number;
}

/**
 * Read the gate-movement log (part 5a): a filtered, paginated view of gate scans
 * from audit_logs, with display names resolved by the repository's joins.
 *
 * Authorization is enforced HERE as well as by the RolesGuard (defense in depth).
 * This use-case NEVER writes — audit_logs is append-only — and the page size is
 * clamped to a hard maximum so a report can never dump the whole table.
 */
@Injectable()
export class GetGateLogUseCase {
  static readonly MAX_PAGE_SIZE = 50;
  static readonly DEFAULT_PAGE_SIZE = 20;

  constructor(
    @Inject(AUDIT_QUERY_REPOSITORY)
    private readonly auditQuery: AuditQueryRepository,
  ) {}

  async execute(input: GetGateLogInput): Promise<GateLogPage> {
    if (!REPORT_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_VIEW_REPORTS');
    }

    const from = this.parseDate(input.from, 'INVALID_FROM_DATE');
    const to = this.parseDate(input.to, 'INVALID_TO_DATE');
    if (from && to && from > to) {
      throw new BadRequestException('FROM_DATE_AFTER_TO_DATE');
    }

    return this.auditQuery.queryGateLog({
      from,
      to,
      // A blank/whitespace gate is treated as "no filter", not an empty match.
      gateName: input.gateName?.trim() || undefined,
      result: input.result,
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize),
    });
  }

  private parseDate(
    value: string | undefined,
    errorCode: string,
  ): Date | undefined {
    if (value === undefined || value === '') return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(errorCode);
    }
    return parsed;
  }

  private normalizePage(page?: number): number {
    if (page === undefined || !Number.isFinite(page)) return 1;
    return Math.max(1, Math.floor(page));
  }

  private normalizePageSize(pageSize?: number): number {
    if (pageSize === undefined || !Number.isFinite(pageSize)) {
      return GetGateLogUseCase.DEFAULT_PAGE_SIZE;
    }
    const floored = Math.floor(pageSize);
    if (floored < 1) return 1;
    return Math.min(floored, GetGateLogUseCase.MAX_PAGE_SIZE);
  }
}
