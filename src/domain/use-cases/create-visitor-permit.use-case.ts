import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Role } from '../auth/role';
import { PersonnelType } from '../entities/employee.entity';
import { PermitType } from '../entities/permit.entity';
import {
  CreatePermitData,
  PermitRepository,
  PERMIT_REPOSITORY,
} from '../repositories/permit.repository';
import { BarcodeService, BARCODE_SERVICE } from '../services/barcode.service';

// Only these roles may issue visitor permits.
const PERMIT_ISSUER_ROLES: Role[] = [
  'super_admin',
  'permit_officer',
  'branch_head',
  'supervisor',
];

export interface CreateVisitorPermitInput {
  actingRole: Role;
  issuedBy: string;
  permitType: PermitType;
  visitorName: string;
  idOrPhone: string;
  personnelType: PersonnelType;
  host: string;
  reason: string;
  // Scheduled-only window (ISO date strings).
  startDate?: string;
  endDate?: string;
  allowedDays?: number[];
  allowedTimeFrom?: string;
  allowedTimeTo?: string;
}

/**
 * Create a visitor permit. Activated immediately (status = active), no prior
 * approval. A scheduled permit requires a date window; a single-entry permit
 * stores only its type and status here — its 2-hour window and consumption are
 * a later step and are NOT set now.
 */
@Injectable()
export class CreateVisitorPermitUseCase {
  constructor(
    @Inject(PERMIT_REPOSITORY) private readonly permits: PermitRepository,
    @Inject(BARCODE_SERVICE) private readonly barcodes: BarcodeService,
  ) {}

  async execute(
    input: CreateVisitorPermitInput,
  ): Promise<{ permitNumber: string; token: string }> {
    if (!PERMIT_ISSUER_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_ISSUE_PERMIT');
    }

    if (
      !input.visitorName?.trim() ||
      !input.host?.trim() ||
      !input.reason?.trim()
    ) {
      throw new BadRequestException('MISSING_REQUIRED_PERMIT_FIELDS');
    }
    if (!input.idOrPhone?.trim()) {
      throw new BadRequestException('VISITOR_ID_REQUIRED');
    }

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (input.permitType === 'scheduled') {
      if (!input.startDate || !input.endDate) {
        throw new BadRequestException('SCHEDULED_PERMIT_REQUIRES_DATE_WINDOW');
      }
      startDate = new Date(input.startDate);
      endDate = new Date(input.endDate);
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new BadRequestException('INVALID_DATE_WINDOW');
      }
      if (endDate < startDate) {
        throw new BadRequestException('END_DATE_BEFORE_START_DATE');
      }
    }

    const permitNumber = await this.permits.nextPermitNumber();
    // Signed, permanent permit token — same HMAC scheme as the employee barcode,
    // distinguished by the `permit:` payload namespace. Verified at the gate later.
    const token = this.barcodes.generate(`permit:${permitNumber}`);

    const data: CreatePermitData = {
      permitNumber,
      token,
      permitType: input.permitType,
      status: 'active', // immediate activation, no prior approval
      visitorName: input.visitorName.trim(),
      idOrPhone: input.idOrPhone.trim(),
      personnelType: input.personnelType,
      host: input.host.trim(),
      reason: input.reason.trim(),
      startDate,
      endDate,
      allowedDays:
        input.permitType === 'scheduled' ? (input.allowedDays ?? []) : [],
      allowedTimeFrom:
        input.permitType === 'scheduled' ? input.allowedTimeFrom : undefined,
      allowedTimeTo:
        input.permitType === 'scheduled' ? input.allowedTimeTo : undefined,
      issuedBy: input.issuedBy,
    };

    await this.permits.create(data);
    return { permitNumber, token };
  }
}
