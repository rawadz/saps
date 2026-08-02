import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import {
  EmployeeBarcodeView,
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';

// Who may issue/view another employee's barcode: the employee-management +
// gate-security leadership. HR is included (HR activates employees, which mints the
// barcode); hr_head is intentionally excluded (mirrors the route's @Roles).
const BARCODE_VIEW_ROLES: Role[] = [
  'super_admin',
  'branch_head',
  'supervisor',
  'hr',
];

export interface GetEmployeeBarcodeForAdminInput {
  actingRole: Role;
  selfId: string;
}

/**
 * Read a specific employee's permanent barcode for an authorized administrator.
 *
 * The barcode token is returned EXACTLY as stored (minted once at activation); it is
 * never regenerated here, so a re-issued QR stays scan-compatible. The result is the
 * SAFE projection only — militaryId / phone / national id are never read or returned.
 * A not-yet-activated employee resolves with barcodeToken = null (not an error), so
 * the UI can show "not activated — no barcode" rather than a failure.
 */
@Injectable()
export class GetEmployeeBarcodeForAdminUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
  ) {}

  async execute(
    input: GetEmployeeBarcodeForAdminInput,
  ): Promise<EmployeeBarcodeView> {
    // Defense in depth alongside the controller's RolesGuard.
    if (!BARCODE_VIEW_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('FORBIDDEN_BARCODE');
    }

    const view = await this.employees.findBarcodeViewBySelfId(input.selfId);
    if (!view) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }
    return view;
  }
}
