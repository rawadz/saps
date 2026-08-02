import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import {
  EmployeeDisplayStatus,
  EmployeeStatus,
  PersonnelType,
  employeeDisplayStatus,
} from '../entities/employee.entity';
import {
  EmployeeListFilter,
  EmployeeQueryRepository,
  EmployeeStatusFilter,
  EMPLOYEE_QUERY_REPOSITORY,
} from '../repositories/employee-query.repository';

export interface GetEmployeesListInput {
  actingRole: Role;
  status?: EmployeeStatusFilter;
  nameQuery?: string;
  page?: number;
  pageSize?: number;
}

/** One employee as returned to an authorized admin — safe fields only. */
export interface EmployeeListItem {
  selfId: string;
  fullName: string;
  personnelType: PersonnelType;
  displayStatus: EmployeeDisplayStatus; // derived: مفعّل / محظور / غير مفعّل
  status: EmployeeStatus; // raw lifecycle status (pending/active/suspended/terminated)
  commandDepartment: string | null;
  branch: string | null;
  createdAt: Date;
}

export interface EmployeesListResult {
  items: EmployeeListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Read a paginated, optionally-filtered employee directory.
 *
 * Authorization reuses the activation hierarchy (the same rule as creating an
 * employee): a role may list the directory only if it may activate the `employee`
 * role — super_admin / branch_head / supervisor / hr. This is checked HERE in
 * addition to the controller's RolesGuard (defense in depth). The page size is
 * clamped to a hard maximum so a listing can never dump the whole table.
 */
@Injectable()
export class GetEmployeesListUseCase {
  static readonly MAX_PAGE_SIZE = 50;
  static readonly DEFAULT_PAGE_SIZE = 20;

  constructor(
    @Inject(EMPLOYEE_QUERY_REPOSITORY)
    private readonly employees: EmployeeQueryRepository,
  ) {}

  async execute(input: GetEmployeesListInput): Promise<EmployeesListResult> {
    if (!canActivate(input.actingRole, 'employee')) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_LIST_EMPLOYEES');
    }

    const filter: EmployeeListFilter = {
      status: input.status,
      // A blank/whitespace query is treated as "no filter", not an empty match.
      nameQuery: input.nameQuery?.trim() || undefined,
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize),
    };

    const page = await this.employees.listEmployees(filter);

    return {
      // The display status is derived in the Domain (not the data layer); the raw
      // status is passed through alongside it so the UI can show finer detail.
      items: page.items.map((row) => ({
        selfId: row.selfId,
        fullName: row.fullName,
        personnelType: row.personnelType,
        displayStatus: employeeDisplayStatus(row.status, row.isEntryBlocked),
        status: row.status,
        commandDepartment: row.commandDepartment,
        branch: row.branch,
        createdAt: row.createdAt,
      })),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
    };
  }

  private normalizePage(page?: number): number {
    if (page === undefined || !Number.isFinite(page)) return 1;
    return Math.max(1, Math.floor(page));
  }

  private normalizePageSize(pageSize?: number): number {
    if (pageSize === undefined || !Number.isFinite(pageSize)) {
      return GetEmployeesListUseCase.DEFAULT_PAGE_SIZE;
    }
    const floored = Math.floor(pageSize);
    if (floored < 1) return 1;
    return Math.min(floored, GetEmployeesListUseCase.MAX_PAGE_SIZE);
  }
}
