import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Permit } from '../entities/permit.entity';
import {
  PermitRepository,
  PERMIT_REPOSITORY,
} from '../repositories/permit.repository';

/**
 * Read a visitor permit by its number. The visitor's id/phone is decrypted by the
 * repository for the authorized reader (the route is restricted to permit roles).
 */
@Injectable()
export class GetVisitorPermitUseCase {
  constructor(
    @Inject(PERMIT_REPOSITORY) private readonly permits: PermitRepository,
  ) {}

  async execute(permitNumber: string): Promise<Permit> {
    const permit = await this.permits.findByPermitNumber(permitNumber);
    if (!permit) {
      throw new NotFoundException('PERMIT_NOT_FOUND');
    }
    return permit;
  }
}
