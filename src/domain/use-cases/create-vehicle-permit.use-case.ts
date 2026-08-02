import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import { VehicleType } from '../entities/vehicle-permit.entity';
import {
  CreateVehiclePermitData,
  VehiclePermitRepository,
  VEHICLE_PERMIT_REPOSITORY,
} from '../repositories/vehicle-permit.repository';
import { BarcodeService, BARCODE_SERVICE } from '../services/barcode.service';

const VEHICLE_PERMIT_ROLES: Role[] = [
  'super_admin',
  'permit_officer',
  'branch_head',
  'supervisor',
];

export interface CreateVehiclePermitInput {
  actingRole: Role;
  plateNumber: string;
  vehicleType: VehicleType;
  color?: string;
  make?: string;
  model?: string;
  expiresAt?: string; // ISO date string
  // Provide EXACTLY ONE owner.
  ownerEmployeeSelfId?: string;
  ownerVisitorPermitNumber?: string;
}

/**
 * Create a vehicle permit, activated immediately. A vehicle is never anonymous:
 * it must link to EXACTLY ONE owner — an employee (by self id) OR a visitor permit
 * (by permit number). The owner is verified to exist before creation; the DB
 * CHECK (vehicle_must_have_owner) is the structural backstop.
 */
@Injectable()
export class CreateVehiclePermitUseCase {
  constructor(
    @Inject(VEHICLE_PERMIT_REPOSITORY)
    private readonly vehiclePermits: VehiclePermitRepository,
    @Inject(BARCODE_SERVICE) private readonly barcodes: BarcodeService,
  ) {}

  async execute(
    input: CreateVehiclePermitInput,
  ): Promise<{ id: string; barcodeToken: string }> {
    if (!VEHICLE_PERMIT_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_ISSUE_VEHICLE_PERMIT');
    }

    if (!input.plateNumber?.trim()) {
      throw new BadRequestException('PLATE_NUMBER_REQUIRED');
    }

    // Exactly one owner — never both, never neither (mirrors the DB CHECK).
    const hasEmployee = !!input.ownerEmployeeSelfId?.trim();
    const hasPermit = !!input.ownerVisitorPermitNumber?.trim();
    if (hasEmployee === hasPermit) {
      throw new BadRequestException('VEHICLE_MUST_HAVE_EXACTLY_ONE_OWNER');
    }

    let employeeId: string | undefined;
    let visitorPermitId: string | undefined;

    if (hasEmployee) {
      const resolved = await this.vehiclePermits.resolveEmployeeId(
        input.ownerEmployeeSelfId!.trim(),
      );
      if (!resolved) {
        throw new NotFoundException('OWNER_EMPLOYEE_NOT_FOUND');
      }
      employeeId = resolved;
    } else {
      const resolved = await this.vehiclePermits.resolveVisitorPermitId(
        input.ownerVisitorPermitNumber!.trim(),
      );
      if (!resolved) {
        throw new NotFoundException('OWNER_VISITOR_PERMIT_NOT_FOUND');
      }
      visitorPermitId = resolved;
    }

    let expiresAt: Date | undefined;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        throw new BadRequestException('INVALID_EXPIRY_DATE');
      }
    }

    const data: CreateVehiclePermitData = {
      plateNumber: input.plateNumber.trim(),
      vehicleType: input.vehicleType,
      color: input.color?.trim() || undefined,
      make: input.make?.trim() || undefined,
      model: input.model?.trim() || undefined,
      expiresAt,
      employeeId,
      visitorPermitId,
    };

    const { id } = await this.vehiclePermits.create(data);
    // Signed, vehicle-namespaced token — same HMAC scheme as the employee barcode
    // and the visitor-permit token. Verified at the gate in a later step (4c-3-b).
    const barcodeToken = this.barcodes.generate(`vehicle:${id}`);
    await this.vehiclePermits.setBarcodeToken(id, barcodeToken);
    return { id, barcodeToken };
  }
}
