import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import {
  EmployeeRowValidator,
  EMPLOYEE_ROW_VALIDATOR,
} from '../services/employee-row-validator';
import { CreateEmployeeUseCase } from './create-employee.use-case';

export interface BulkCreateEmployeesInput {
  actingRole: Role;
  items: unknown[];
}

export interface BulkCreateFailure {
  index: number;
  selfId: string | null;
  code: string;
}

export interface BulkCreatedItem {
  selfId: string;
  fullName: string;
}

export interface BulkCreateReport {
  created: number;
  failed: BulkCreateFailure[];
  createdItems: BulkCreatedItem[];
}

/** Best-effort self id for the report when a row fails validation. */
function rowSelfId(row: unknown): string | null {
  if (row && typeof row === 'object' && 'selfId' in row) {
    const v = (row as { selfId: unknown }).selfId;
    return typeof v === 'string' ? v : null;
  }
  return null;
}

/** Extract the stable code from an exception thrown by the reused use-case. */
function errorCode(err: unknown): string {
  return err instanceof Error && typeof err.message === 'string'
    ? err.message
    : 'UNKNOWN';
}

/**
 * Create many employees in one request. It REUSES CreateEmployeeUseCase for every
 * row (so the create + duplicate-against-DB logic is never duplicated) and validates
 * each row with EXACTLY the single-create rules via EmployeeRowValidator.
 *
 * It never stops at the first error: invalid/duplicate rows are skipped and recorded
 * in a per-row report, while valid rows are created. Authorization is checked ONCE
 * up front (fail-fast 403); the hard size cap is enforced here too (defense in depth
 * alongside the DTO).
 */
@Injectable()
export class BulkCreateEmployeesUseCase {
  static readonly MAX_ITEMS = 1000;

  constructor(
    private readonly createEmployee: CreateEmployeeUseCase,
    @Inject(EMPLOYEE_ROW_VALIDATOR)
    private readonly validator: EmployeeRowValidator,
  ) {}

  async execute(input: BulkCreateEmployeesInput): Promise<BulkCreateReport> {
    if (!canActivate(input.actingRole, 'employee')) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_CREATE');
    }
    if (input.items.length > BulkCreateEmployeesUseCase.MAX_ITEMS) {
      throw new BadRequestException('TOO_MANY_ITEMS');
    }

    const report: BulkCreateReport = { created: 0, failed: [], createdItems: [] };
    const seen = new Set<string>(); // self ids already seen IN THIS batch

    for (let index = 0; index < input.items.length; index++) {
      const raw = input.items[index];

      // 1. Same full validation as a single create (delegated to the port).
      const validation = this.validator.validate(raw);
      if (!validation.ok) {
        report.failed.push({ index, selfId: rowSelfId(raw), code: validation.code });
        continue;
      }
      const data = validation.data;

      // 2. Duplicate WITHIN this batch (before any DB call).
      if (seen.has(data.selfId)) {
        report.failed.push({
          index,
          selfId: data.selfId,
          code: 'SELF_ID_DUPLICATED_IN_FILE',
        });
        continue;
      }
      seen.add(data.selfId);

      // 3. Reuse the single-create use-case — it re-checks and writes, and throws
      //    EMPLOYEE_ALREADY_EXISTS for a duplicate already in the database.
      try {
        await this.createEmployee.execute({ actingRole: input.actingRole, data });
        report.created += 1;
        report.createdItems.push({
          selfId: data.selfId,
          fullName: data.fullName,
        });
      } catch (err) {
        report.failed.push({ index, selfId: data.selfId, code: errorCode(err) });
      }
    }

    return report;
  }
}
