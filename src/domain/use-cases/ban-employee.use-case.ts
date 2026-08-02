import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import { AuditLogger, AUDIT_LOGGER } from '../services/audit.logger';
import { BanListCache, BAN_LIST_CACHE } from '../services/ban-list.cache';

const BAN_ALLOWED_ROLES: Role[] = ['super_admin', 'branch_head', 'supervisor'];

export interface BanEmployeeInput {
  actingRole: Role;
  actingUserId: string;
  selfId: string;
  reason: string;
}

/**
 * Ban an employee. The ban takes effect IMMEDIATELY: the DB flag flips, the Redis
 * ban list is updated in the same operation, and the action is audited with its
 * mandatory reason — so the very next scan (even of an offline screenshot) is red.
 */
@Injectable()
export class BanEmployeeUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(BAN_LIST_CACHE) private readonly banList: BanListCache,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute(input: BanEmployeeInput): Promise<void> {
    if (!BAN_ALLOWED_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_BAN');
    }
    if (!input.reason || input.reason.trim().length < 3) {
      throw new BadRequestException('BAN_REASON_REQUIRED');
    }

    const employee = await this.employees.findByEmployeeId(input.selfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    // 1. Persist (DB is the source of truth).
    await this.employees.setEntryBlocked(input.selfId, true);
    // 2. Update the real-time cache so the next scan is instantly red.
    await this.banList.add(input.selfId);
    // 3. Audit with the reason (the reason is not sensitive PII).
    await this.audit.record({
      type: 'entry_block',
      subjectType: 'employee',
      subjectRef: input.selfId,
      actorUserId: input.actingUserId,
      result: 'success',
      reason: input.reason,
    });
  }
}
