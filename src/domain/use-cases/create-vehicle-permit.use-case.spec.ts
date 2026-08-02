import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VehiclePermit } from '../entities/vehicle-permit.entity';
import {
  CreateVehiclePermitData,
  VehiclePermitRepository,
} from '../repositories/vehicle-permit.repository';
import { BarcodeService } from '../services/barcode.service';
import {
  CreateVehiclePermitInput,
  CreateVehiclePermitUseCase,
} from './create-vehicle-permit.use-case';

class FakeVehiclePermits implements VehiclePermitRepository {
  public created: CreateVehiclePermitData[] = [];
  public tokenSets: { id: string; token: string }[] = [];
  constructor(
    private readonly opts: {
      employeeIds?: Record<string, string>;
      permitIds?: Record<string, string>;
      byId?: Record<string, VehiclePermit>;
    } = {},
  ) {}
  resolveEmployeeId(selfId: string): Promise<string | null> {
    return Promise.resolve(this.opts.employeeIds?.[selfId] ?? null);
  }
  resolveVisitorPermitId(permitNumber: string): Promise<string | null> {
    return Promise.resolve(this.opts.permitIds?.[permitNumber] ?? null);
  }
  create(data: CreateVehiclePermitData): Promise<{ id: string }> {
    this.created.push(data);
    return Promise.resolve({ id: 'vp-new' });
  }
  setBarcodeToken(id: string, token: string): Promise<void> {
    this.tokenSets.push({ id, token });
    return Promise.resolve();
  }
  findById(id: string): Promise<VehiclePermit | null> {
    return Promise.resolve(this.opts.byId?.[id] ?? null);
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

// create() returns id 'vp-new', so the use-case signs `vehicle:vp-new`.
const EXPECTED_TOKEN = 'v1.vehicle:vp-new.sig';

function newUseCase(repo: FakeVehiclePermits): CreateVehiclePermitUseCase {
  return new CreateVehiclePermitUseCase(repo, new FakeBarcodes());
}

const base: CreateVehiclePermitInput = {
  actingRole: 'permit_officer',
  plateNumber: 'ABC-1234',
  vehicleType: 'private',
  ownerEmployeeSelfId: 'E-1001',
};

describe('CreateVehiclePermitUseCase', () => {
  // Every negative path must reject WITHOUT persisting (create() never reached).
  it('forbids a role not allowed to issue vehicle permits (guard)', async () => {
    const repo = new FakeVehiclePermits({ employeeIds: { 'E-1001': 'emp-1' } });
    await expect(
      newUseCase(repo).execute({ ...base, actingRole: 'guard' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.created).toHaveLength(0);
  });

  it('rejects when the plate number is missing/blank', async () => {
    const repo = new FakeVehiclePermits({ employeeIds: { 'E-1001': 'emp-1' } });
    await expect(
      newUseCase(repo).execute({ ...base, plateNumber: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.created).toHaveLength(0);
  });

  it('rejects when NO owner is provided', async () => {
    const repo = new FakeVehiclePermits();
    await expect(
      newUseCase(repo).execute({ ...base, ownerEmployeeSelfId: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.created).toHaveLength(0);
  });

  it('rejects when BOTH owners are provided', async () => {
    const repo = new FakeVehiclePermits();
    await expect(
      newUseCase(repo).execute({ ...base, ownerVisitorPermitNumber: 'VP-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.created).toHaveLength(0);
  });

  it('throws when the employee owner does not exist', async () => {
    const repo = new FakeVehiclePermits();
    await expect(newUseCase(repo).execute(base)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.created).toHaveLength(0);
  });

  it('throws when the visitor-permit owner does not exist', async () => {
    const repo = new FakeVehiclePermits();
    await expect(
      newUseCase(repo).execute({
        actingRole: 'permit_officer',
        plateNumber: 'ABC-1234',
        vehicleType: 'private',
        ownerVisitorPermitNumber: 'VP-NONE',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.created).toHaveLength(0);
  });

  it('rejects an invalid expiry date', async () => {
    const repo = new FakeVehiclePermits({ employeeIds: { 'E-1001': 'emp-1' } });
    await expect(
      newUseCase(repo).execute({ ...base, expiresAt: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.created).toHaveLength(0);
  });

  it('generates and persists a signed vehicle token (never null)', async () => {
    const repo = new FakeVehiclePermits({ employeeIds: { 'E-1001': 'emp-1' } });
    const result = await newUseCase(repo).execute(base);
    expect(result.barcodeToken).toBe(EXPECTED_TOKEN);
    expect(result.barcodeToken).not.toBeNull();
    expect(repo.tokenSets).toEqual([{ id: 'vp-new', token: EXPECTED_TOKEN }]);
  });

  it('creates a permit linked to an employee owner and returns id + token', async () => {
    const repo = new FakeVehiclePermits({ employeeIds: { 'E-1001': 'emp-1' } });

    const result = await newUseCase(repo).execute({
      ...base,
      color: 'white',
      make: 'Toyota',
      model: 'Camry',
      expiresAt: '2026-12-31T00:00:00.000Z',
    });

    expect(result).toEqual({ id: 'vp-new', barcodeToken: EXPECTED_TOKEN });
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]).toMatchObject({
      plateNumber: 'ABC-1234',
      vehicleType: 'private',
      color: 'white',
      make: 'Toyota',
      model: 'Camry',
      employeeId: 'emp-1',
    });
    expect(repo.created[0].visitorPermitId).toBeUndefined();
    expect(repo.created[0].expiresAt).toEqual(
      new Date('2026-12-31T00:00:00.000Z'),
    );
  });

  it('creates a permit linked to a visitor-permit owner', async () => {
    const repo = new FakeVehiclePermits({
      permitIds: { 'VP-TEST123': 'permit-1' },
    });

    const result = await newUseCase(repo).execute({
      actingRole: 'supervisor',
      plateNumber: 'XYZ-9',
      vehicleType: 'government',
      ownerVisitorPermitNumber: 'VP-TEST123',
    });

    expect(result.barcodeToken).toBe(EXPECTED_TOKEN);
    expect(repo.created[0]).toMatchObject({
      plateNumber: 'XYZ-9',
      vehicleType: 'government',
      visitorPermitId: 'permit-1',
    });
    expect(repo.created[0].employeeId).toBeUndefined();
  });
});
