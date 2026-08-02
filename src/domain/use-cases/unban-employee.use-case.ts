import {
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

const UNBAN_ALLOWED_ROLES: Role[] = [
  'super_admin',
  'branch_head',
  'supervisor',
];

export interface UnbanEmployeeInput {
  actingRole: Role;
  actingUserId: string;
  selfId: string;
  reason?: string;
}

/**
 * Reverse a ban: clear the DB flag, remove from the Redis ban list, and audit as
 * `entry_unblock`. The employee's permanent barcode becomes valid again
 * immediately — no regeneration needed.
 */
@Injectable()
export class UnbanEmployeeUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(BAN_LIST_CACHE) private readonly banList: BanListCache,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute(input: UnbanEmployeeInput): Promise<void> {
    if (!UNBAN_ALLOWED_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_UNBAN');
    }

    const employee = await this.employees.findByEmployeeId(input.selfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    await this.employees.setEntryBlocked(input.selfId, false);
    await this.banList.remove(input.selfId);
    await this.audit.record({
      type: 'entry_unblock',
      subjectType: 'employee',
      subjectRef: input.selfId,
      actorUserId: input.actingUserId,
      result: 'success',
      reason: input.reason,
    });
  }
}
