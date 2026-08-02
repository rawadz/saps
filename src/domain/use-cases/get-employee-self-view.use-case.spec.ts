import { NotFoundException } from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import {
  EmployeeProfile,
  EmployeeRepository,
} from '../repositories/employee.repository';
import { GetEmployeeSelfViewUseCase } from './get-employee-self-view.use-case';

class FakeEmployees implements EmployeeRepository {
  // Pre-existing fake completeness: EmployeeRepository read method (unused here).
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  constructor(
    private readonly profiles: Record<string, EmployeeProfile> = {},
  ) {}
  findByEmployeeId(): Promise<Employee | null> {
    return Promise.resolve(null);
  }
  findById(): Promise<Employee | null> {
    return Promise.resolve(null);
  }
  isBanned(): Promise<boolean> {
    return Promise.resolve(false);
  }
  create(): Promise<void> {
    return Promise.resolve();
  }
  findProfileBySelfId(selfId: string): Promise<EmployeeProfile | null> {
    return Promise.resolve(this.profiles[selfId] ?? null);
  }
  activateWithBarcode(): Promise<void> {
    return Promise.resolve();
  }
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
  setServiceStatus(): Promise<void> {
    return Promise.resolve();
  }
}

const profile: EmployeeProfile = {
  selfId: 'E-1001',
  militaryId: null,
  fullName: 'Sara Q.',
  commandDepartment: 'IT',
  branch: null,
  priority: null,
  rank: null,
  currentJobTitle: null,
  personnelType: 'civilian',
  status: 'active',
  photoUrl: null,
  barcodeToken: 'v1.eC1zZWxm.sig',
};

describe('GetEmployeeSelfViewUseCase', () => {
  it('returns the profile (incl. barcode) for an existing employee', async () => {
    const uc = new GetEmployeeSelfViewUseCase(
      new FakeEmployees({ 'E-1001': profile }),
    );
    await expect(uc.execute('E-1001')).resolves.toEqual(profile);
  });

  it('throws when the employee does not exist', async () => {
    const uc = new GetEmployeeSelfViewUseCase(new FakeEmployees());
    await expect(uc.execute('E-9999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
