import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import { EmployeeRepository } from '../repositories/employee.repository';
import { BarcodeService } from '../services/barcode.service';
import { ActivateEmployeeAccountUseCase } from './activate-employee-account.use-case';

class FakeEmployees implements EmployeeRepository {
  // Pre-existing fake completeness: EmployeeRepository read method (unused here).
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  public activated: { selfId: string; token: string; by?: string }[] = [];
  constructor(private readonly existing: Record<string, Employee> = {}) {}
  findByEmployeeId(id: string): Promise<Employee | null> {
    return Promise.resolve(this.existing[id] ?? null);
  }
  findById(): Promise<Employee | null> {
    return Promise.resolve(null);
  }
  isBanned(): Promise<boolean> {
    return Promise.resolve(false);
  }
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
  create(): Promise<void> {
    return Promise.resolve();
  }
  findProfileBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  setServiceStatus(): Promise<void> {
    return Promise.resolve();
  }
  activateWithBarcode(
    selfId: string,
    barcodeToken: string,
    generatedByUserId?: string,
  ): Promise<void> {
    this.activated.push({ selfId, token: barcodeToken, by: generatedByUserId });
    return Promise.resolve();
  }
}

class FakeBarcodes implements BarcodeService {
  generate(selfId: string): string {
    return `v1.${selfId}.sig`;
  }
  verify(): string | null {
    return null;
  }
}

const pending = new Employee(
  'E-1001',
  'Sara',
  'IT',
  'civilian',
  'pending',
  false,
);

describe('ActivateEmployeeAccountUseCase', () => {
  it('forbids a guard from activating an employee', async () => {
    const uc = new ActivateEmployeeAccountUseCase(
      new FakeEmployees({ 'E-1001': pending }),
      new FakeBarcodes(),
    );
    await expect(
      uc.execute({
        actingRole: 'guard',
        actingUserId: 'g1',
        targetSelfId: 'E-1001',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when the employee does not exist', async () => {
    const uc = new ActivateEmployeeAccountUseCase(
      new FakeEmployees(),
      new FakeBarcodes(),
    );
    await expect(
      uc.execute({
        actingRole: 'hr',
        actingUserId: 'h1',
        targetSelfId: 'E-9999',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('activates and attaches the generated barcode (HR)', async () => {
    const repo = new FakeEmployees({ 'E-1001': pending });
    const uc = new ActivateEmployeeAccountUseCase(repo, new FakeBarcodes());
    await uc.execute({
      actingRole: 'hr',
      actingUserId: 'h1',
      targetSelfId: 'E-1001',
    });
    expect(repo.activated).toEqual([
      { selfId: 'E-1001', token: 'v1.E-1001.sig', by: 'h1' },
    ]);
  });
});
