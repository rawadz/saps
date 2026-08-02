import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Permit } from '../entities/permit.entity';
import {
  CreatePermitData,
  PermitRepository,
} from '../repositories/permit.repository';
import { BarcodeService } from '../services/barcode.service';
import {
  CreateVisitorPermitInput,
  CreateVisitorPermitUseCase,
} from './create-visitor-permit.use-case';

class FakePermits implements PermitRepository {
  public created: CreatePermitData[] = [];
  nextPermitNumber(): Promise<string> {
    return Promise.resolve('VP-TEST123');
  }
  create(data: CreatePermitData): Promise<void> {
    this.created.push(data);
    return Promise.resolve();
  }
  findByPermitNumber(): Promise<Permit | null> {
    return Promise.resolve(null);
  }
  findById(): Promise<Permit | null> {
    return Promise.resolve(null);
  }
  consumeSingleEntry(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

// Deterministic stand-in for HmacBarcodeService: token = v1.<input>.sig
class FakeBarcodes implements BarcodeService {
  generate(input: string): string {
    return `v1.${input}.sig`;
  }
  verify(): string | null {
    return null;
  }
}

// The use-case signs `permit:<permitNumber>`, and nextPermitNumber() -> 'VP-TEST123'.
const EXPECTED_TOKEN = 'v1.permit:VP-TEST123.sig';

function newUseCase(repo: FakePermits): CreateVisitorPermitUseCase {
  return new CreateVisitorPermitUseCase(repo, new FakeBarcodes());
}

const base: CreateVisitorPermitInput = {
  actingRole: 'permit_officer',
  issuedBy: 'po-1',
  permitType: 'single_entry',
  visitorName: 'Visitor One',
  idOrPhone: '1234567890',
  personnelType: 'civilian',
  host: 'IT Department',
  reason: 'Maintenance visit',
};

describe('CreateVisitorPermitUseCase', () => {
  it('forbids a role not allowed to issue permits (guard)', async () => {
    const repo = new FakePermits();
    await expect(
      newUseCase(repo).execute({ ...base, actingRole: 'guard' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.created).toHaveLength(0);
  });

  it('requires visitor name, host and reason', async () => {
    await expect(
      newUseCase(new FakePermits()).execute({ ...base, visitorName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the visitor id', async () => {
    await expect(
      newUseCase(new FakePermits()).execute({ ...base, idOrPhone: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a date window for a scheduled permit', async () => {
    await expect(
      newUseCase(new FakePermits()).execute({
        ...base,
        permitType: 'scheduled',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an end date before the start date', async () => {
    await expect(
      newUseCase(new FakePermits()).execute({
        ...base,
        permitType: 'scheduled',
        startDate: '2026-06-25',
        endDate: '2026-06-20',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generates and stores a signed token derived from the permit number (never null)', async () => {
    const repo = new FakePermits();
    const result = await newUseCase(repo).execute(base);
    expect(result.token).toBe(EXPECTED_TOKEN);
    expect(repo.created[0].token).toBe(EXPECTED_TOKEN);
    expect(repo.created[0].token).not.toBeNull();
  });

  it('creates a single-entry permit (active, no date window) and returns the token', async () => {
    const repo = new FakePermits();

    const result = await newUseCase(repo).execute(base);

    expect(result).toEqual({
      permitNumber: 'VP-TEST123',
      token: EXPECTED_TOKEN,
    });
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]).toMatchObject({
      permitNumber: 'VP-TEST123',
      token: EXPECTED_TOKEN,
      permitType: 'single_entry',
      status: 'active',
      visitorName: 'Visitor One',
      idOrPhone: '1234567890', // plaintext to the repo; the repo encrypts it
      host: 'IT Department',
      reason: 'Maintenance visit',
      issuedBy: 'po-1',
    });
    expect(repo.created[0].startDate).toBeUndefined();
    expect(repo.created[0].endDate).toBeUndefined();
  });

  it('creates a scheduled permit with the date window', async () => {
    const repo = new FakePermits();

    await newUseCase(repo).execute({
      ...base,
      permitType: 'scheduled',
      startDate: '2026-06-20',
      endDate: '2026-06-25',
      allowedDays: [1, 2, 3],
      allowedTimeFrom: '08:00',
      allowedTimeTo: '17:00',
    });

    const created = repo.created[0];
    expect(created.permitType).toBe('scheduled');
    expect(created.status).toBe('active');
    expect(created.token).toBe(EXPECTED_TOKEN);
    expect(created.startDate).toBeInstanceOf(Date);
    expect(created.endDate).toBeInstanceOf(Date);
    expect(created.allowedDays).toEqual([1, 2, 3]);
    expect(created.allowedTimeFrom).toBe('08:00');
    expect(created.allowedTimeTo).toBe('17:00');
  });
});
