import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import {
  EmployeeBarcodeExportRow,
  EmployeeQueryRepository,
  EmployeeStatusFilter,
  EMPLOYEE_QUERY_REPOSITORY,
} from '../repositories/employee-query.repository';

// Who may export employee barcodes — mirrors BARCODE_VIEW_ROLES from the single
// admin barcode route. The barcode is a gate credential, so the export is gated to
// the employee-management + gate-security leadership and excludes hr_head.
const BARCODE_EXPORT_ROLES: Role[] = [
  'super_admin',
  'branch_head',
  'supervisor',
  'hr',
];

export interface ExportEmployeesBarcodesInput {
  actingRole: Role;
  status?: EmployeeStatusFilter;
  q?: string;
}

/**
 * Collect every employee matching the (optional) directory filters together with
 * their barcode token, for the admin Excel export. The role is re-checked here
 * (defense in depth alongside the controller's RolesGuard). The repository returns a
 * SAFE projection only — never militaryId / phone. A not-yet-activated employee stays
 * in the result with barcodeToken = null (an empty cell in the exported file).
 */
@Injectable()
export class ExportEmployeesBarcodesUseCase {
  constructor(
    @Inject(EMPLOYEE_QUERY_REPOSITORY)
    private readonly employees: EmployeeQueryRepository,
  ) {}

  execute(
    input: ExportEmployeesBarcodesInput,
  ): Promise<EmployeeBarcodeExportRow[]> {
    if (!BARCODE_EXPORT_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('FORBIDDEN_BARCODE_EXPORT');
    }

    return this.employees.listBarcodesForExport({
      status: input.status,
      // A blank/whitespace query is treated as "no filter", not an empty match.
      nameQuery: input.q?.trim() || undefined,
    });
  }
}
