import { NotFoundException } from '@nestjs/common';
import { VehiclePermit } from '../entities/vehicle-permit.entity';
import { VehiclePermitRepository } from '../repositories/vehicle-permit.repository';
import { GetVehiclePermitUseCase } from './get-vehicle-permit.use-case';

class FakeVehiclePermits implements VehiclePermitRepository {
  constructor(private readonly byId: Record<string, VehiclePermit> = {}) {}
  resolveEmployeeId(): Promise<string | null> {
    return Promise.resolve(null);
  }
  resolveVisitorPermitId(): Promise<string | null> {
    return Promise.resolve(null);
  }
  create(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'vp-x' });
  }
  setBarcodeToken(): Promise<void> {
    return Promise.resolve();
  }
  findById(id: string): Promise<VehiclePermit | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
}

function makeVehiclePermit(id: string): VehiclePermit {
  return new VehiclePermit({
    id,
    plateNumber: 'ABC-1234',
    vehicleType: 'private',
    color: 'white',
    make: 'Toyota',
    model: 'Camry',
    barcodeToken: `v1.vehicle:${id}.sig`,
    status: 'active',
    expiresAt: null,
    employeeId: 'emp-1',
    visitorPermitId: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
  });
}

describe('GetVehiclePermitUseCase', () => {
  it('returns the vehicle permit when found', async () => {
    const permit = makeVehiclePermit('vp-1');
    const uc = new GetVehiclePermitUseCase(
      new FakeVehiclePermits({ 'vp-1': permit }),
    );
    await expect(uc.execute('vp-1')).resolves.toBe(permit);
  });

  it('throws when the vehicle permit does not exist', async () => {
    const uc = new GetVehiclePermitUseCase(new FakeVehiclePermits());
    await expect(uc.execute('vp-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
