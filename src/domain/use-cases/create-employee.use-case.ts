import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import {
  CreateEmployeeData,
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import { BarcodeService, BARCODE_SERVICE } from '../services/barcode.service';

export interface CreateEmployeeInput {
  actingRole: Role;
  data: CreateEmployeeData;
  // Acting admin's user id — recorded as the barcode's generated_by. Optional
  // (e.g. bulk import leaves it null); auth is enforced via actingRole.
  actingUserId?: string;
}

/**
 * Create a new employee record. Authorization reuses the activation hierarchy:
 * a role may create employees only if it may activate the `employee` role
 * (super admin / branch head / supervisor / HR).
 *
 * ACTIVE BY DEFAULT: because create and activate share the same authorization, the
 * new employee is activated immediately in the same flow — its status is set to
 * `active` and the permanent HMAC barcode is generated once — so a freshly added
 * employee is usable at the gate without a separate activation step. Re-activating
 * later is idempotent (the barcode is never regenerated).
 */
@Injectable()
export class CreateEmployeeUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
    @Inject(BARCODE_SERVICE)
    private readonly barcodes: BarcodeService,
  ) {}

  async execute(input: CreateEmployeeInput): Promise<void> {
    if (!canActivate(input.actingRole, 'employee')) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_CREATE');
    }

    const { selfId, fullName } = input.data;
    if (!selfId || !/^[A-Za-z0-9-]{3,32}$/.test(selfId)) {
      throw new BadRequestException('INVALID_EMPLOYEE_ID');
    }
    if (!fullName || fullName.trim().length === 0) {
      throw new BadRequestException('FULL_NAME_REQUIRED');
    }

    // Pre-check for a friendly error; the unique index is the real backstop.
    const existing = await this.employees.findByEmployeeId(selfId);
    if (existing) {
      throw new ConflictException('EMPLOYEE_ALREADY_EXISTS');
    }

    await this.employees.create(input.data);

    // Active by default: activate immediately (status → active + permanent barcode),
    // reusing the same idempotent path as manual activation.
    const token = this.barcodes.generate(selfId);
    await this.employees.activateWithBarcode(selfId, token, input.actingUserId);
  }
}
