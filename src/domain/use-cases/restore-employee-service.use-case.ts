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

const SERVICE_EXIT_ROLES: Role[] = ['super_admin', 'branch_head', 'hr', 'hr_head'];

export interface RestoreServiceInput {
  actingRole: Role;
  actingUserId: string;
  selfId: string;
}

/**
 * Return an employee to active service (serviceStatus -> active), clearing the exit
 * date + note. Corrects a mistaken exit and restores gate access (unless still banned
 * or the account is inactive — those are independent). Audited as `service_restore`.
 */
@Injectable()
export class RestoreEmployeeServiceUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute(input: RestoreServiceInput): Promise<void> {
    if (!SERVICE_EXIT_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_FOR_SERVICE_EXIT');
    }

    const employee = await this.employees.findByEmployeeId(input.selfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    await this.employees.setServiceStatus(input.selfId, 'active', null, null);

    await this.audit.record({
      type: 'service_restore',
      subjectType: 'employee',
      subjectRef: input.selfId,
      actorUserId: input.actingUserId,
      result: 'success',
    });
  }
}
