import { NotFoundException } from '@nestjs/common';
import { Permit } from '../entities/permit.entity';
import { PermitRepository } from '../repositories/permit.repository';
import { GetVisitorPermitUseCase } from './get-visitor-permit.use-case';

class FakePermits implements PermitRepository {
  constructor(private readonly byNumber: Record<string, Permit> = {}) {}
  nextPermitNumber(): Promise<string> {
    return Promise.resolve('VP-X');
  }
  create(): Promise<void> {
    return Promise.resolve();
  }
  findByPermitNumber(permitNumber: string): Promise<Permit | null> {
    return Promise.resolve(this.byNumber[permitNumber] ?? null);
  }
  findById(): Promise<Permit | null> {
    return Promise.resolve(null);
  }
  consumeSingleEntry(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

function makePermit(permitNumber: string): Permit {
  return new Permit({
    id: 'id-1',
    permitNumber,
    token: `v1.permit:${permitNumber}.sig`,
    permitType: 'single_entry',
    status: 'active',
    visitorName: 'Visitor One',
    idOrPhone: '1234567890',
    personnelType: 'civilian',
    host: 'IT',
    reason: 'visit',
    startDate: null,
    endDate: null,
    allowedDays: [],
    allowedTimeFrom: null,
    allowedTimeTo: null,
    expiresAt: null,
    usedAt: null,
    issuedBy: 'po-1',
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
  });
}

describe('GetVisitorPermitUseCase', () => {
  it('returns the permit when found', async () => {
    const permit = makePermit('VP-TEST123');
    const uc = new GetVisitorPermitUseCase(
      new FakePermits({ 'VP-TEST123': permit }),
    );
    await expect(uc.execute('VP-TEST123')).resolves.toBe(permit);
  });

  it('throws when the permit does not exist', async () => {
    const uc = new GetVisitorPermitUseCase(new FakePermits());
    await expect(uc.execute('VP-NONE')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
