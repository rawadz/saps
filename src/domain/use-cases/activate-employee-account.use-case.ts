import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import { BarcodeService, BARCODE_SERVICE } from '../services/barcode.service';

export interface ActivateEmployeeInput {
  actingRole: Role;
  actingUserId: string;
  targetSelfId: string;
}

/**
 * Activate a regular employee account, enforcing the activation hierarchy (only
 * super admin / branch head / supervisor / HR may activate the `employee` role).
 *
 * Per the barcode rule, the permanent HMAC-signed barcode is generated ONCE here,
 * at activation, and attached atomically with the status change. It encodes the
 * employee id only and is never regenerated afterward.
 */
@Injectable()
export class ActivateEmployeeAccountUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
    @Inject(BARCODE_SERVICE)
    private readonly barcodes: BarcodeService,
  ) {}

  async execute(input: ActivateEmployeeInput): Promise<void> {
    if (!canActivate(input.actingRole, 'employee')) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_ACTIVATE');
    }

    const employee = await this.employees.findByEmployeeId(input.targetSelfId);
    if (!employee) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }

    const token = this.barcodes.generate(input.targetSelfId);
    await this.employees.activateWithBarcode(
      input.targetSelfId,
      token,
      input.actingUserId,
    );
  }
}
