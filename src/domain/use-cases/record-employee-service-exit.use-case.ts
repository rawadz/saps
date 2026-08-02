import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import { ServiceStatus } from '../entities/employee.entity';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import { AuditLogger, AUDIT_LOGGER } from '../services/audit.logger';

// Service/employment status is an HR-domain action (distinct from the punitive ban,
// which excludes HR). It blocks the gate as a consequence, not as its purpose.
const SERVICE_EXIT_ROLES: Role[] = ['super_admin', 'branch_head', 'hr', 'hr_head'];

/** The non-active (exit) service statuses a record-exit may set. */
export type ServiceExitStatus = Exclude<ServiceStatus, 'active'>;

export interface RecordServiceExitInput {
  actingRole: Role;
  actingUserId: string;
  selfId: string;
  serviceStatus: ServiceExitStatus;
  exitDate: string; // YYYY-MM-DD (user-entered, may be in the past)
  note?: string;
}

/**
 * Record an employee's exit from service (transferred / discharged / contract-ended),
 * documented with a user-entered date + optional note. The exit blocks the gate (the
 * `serviceStatus` field, SEPARATE from the ban). Rules: the exit type must match the
 * personnel type (discharged→military, contract_ended→civilian, transferred→both), and
 * the exit date may NOT be in the future. Audited as `service_exit`.
 */
@Injectable()
export class RecordEmployeeServiceExitUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute(input: RecordServiceExitInput): Promise<void> {
    if (!SERVICE_EXIT_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_FOR_SERVICE_EXIT');
    }
    if (
      input.serviceStatus !== 'transferred' &&
      input.serviceStatus !== 'discharged' &&
      input.serviceStatus !== 'contract_ended'
    ) {
      throw new BadRequestException('INVALID_SERVICE_STATUS');
    }

    // Parse the user-entered date (UTC midnight) and reject a FUTURE exit date.
    const exitDate = new Date(`${input.exitDate}T00:00:00.000Z`);
    if (Number.isNaN(exitDate.getTime())) {
      throw new BadRequestException('INVALID_EXIT_DATE');
    }
    if (exitDate.getTime() > Date.now()) {
      throw new BadRequestException('EXIT_DATE_IN_FUTURE');
    }

    const employee = await this.employees.findByEmployeeId(input.selfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    // The exit type must match the personnel type.
    if (
      input.serviceStatus === 'discharged' &&
      employee.personnelType !== 'military'
    ) {
      throw new BadRequestException('DISCHARGED_REQUIRES_MILITARY');
    }
    if (
      input.serviceStatus === 'contract_ended' &&
      employee.personnelType !== 'civilian'
    ) {
      throw new BadRequestException('CONTRACT_ENDED_REQUIRES_CIVILIAN');
    }

    const note = input.note?.trim() || null;
    await this.employees.setServiceStatus(
      input.selfId,
      input.serviceStatus,
      exitDate,
      note,
    );

    // The audit reason captures the status + date (+ note) — non-sensitive context.
    await this.audit.record({
      type: 'service_exit',
      subjectType: 'employee',
      subjectRef: input.selfId,
      actorUserId: input.actingUserId,
      result: 'success',
      reason: `${input.serviceStatus}@${input.exitDate}${note ? ` — ${note}` : ''}`,
    });
  }
}
