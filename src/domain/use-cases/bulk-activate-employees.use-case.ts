import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import { ActivateEmployeeAccountUseCase } from './activate-employee-account.use-case';

export interface BulkActivateEmployeesInput {
  actingRole: Role;
  actingUserId: string;
  selfIds: string[];
}

export interface BulkActivateFailure {
  selfId: string;
  code: string;
}

export interface BulkActivateReport {
  activated: number;
  failed: BulkActivateFailure[];
}

function errorCode(err: unknown): string {
  return err instanceof Error && typeof err.message === 'string'
    ? err.message
    : 'UNKNOWN';
}

/**
 * Activate many employees in one request, REUSING ActivateEmployeeAccountUseCase per
 * self id (so the activation + permanent-barcode logic is never duplicated). Never
 * stops at the first error: each failure (e.g. not found) is recorded in the report.
 * Repeated self ids are de-duplicated (activation is processed once). Authorization
 * is checked ONCE up front (fail-fast 403); the hard size cap mirrors the DTO.
 */
@Injectable()
export class BulkActivateEmployeesUseCase {
  static readonly MAX_ITEMS = 1000;

  constructor(
    private readonly activateEmployee: ActivateEmployeeAccountUseCase,
  ) {}

  async execute(input: BulkActivateEmployeesInput): Promise<BulkActivateReport> {
    if (!canActivate(input.actingRole, 'employee')) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_ACTIVATE');
    }
    if (input.selfIds.length > BulkActivateEmployeesUseCase.MAX_ITEMS) {
      throw new BadRequestException('TOO_MANY_ITEMS');
    }

    const report: BulkActivateReport = { activated: 0, failed: [] };
    const seen = new Set<string>();

    for (const rawId of input.selfIds) {
      const selfId = typeof rawId === 'string' ? rawId.trim() : '';
      if (!selfId) {
        report.failed.push({ selfId: String(rawId), code: 'INVALID_EMPLOYEE_ID' });
        continue;
      }
      if (seen.has(selfId)) continue; // de-duplicate — already processed this id
      seen.add(selfId);

      try {
        await this.activateEmployee.execute({
          actingRole: input.actingRole,
          actingUserId: input.actingUserId,
          targetSelfId: selfId,
        });
        report.activated += 1;
      } catch (err) {
        report.failed.push({ selfId, code: errorCode(err) });
      }
    }

    return report;
  }
}
