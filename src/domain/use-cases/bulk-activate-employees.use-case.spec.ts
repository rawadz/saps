import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import {
  CreateEmployeeData,
  EmployeeRepository,
} from '../repositories/employee.repository';
import { BarcodeService } from '../services/barcode.service';
import { ActivateEmployeeAccountUseCase } from './activate-employee-account.use-case';
import { BulkActivateEmployeesUseCase } from './bulk-activate-employees.use-case';

class FakeEmployees implements EmployeeRepository {
  // Pre-existing fake completeness: EmployeeRepository read method (unused here).
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  public activated: string[] = [];
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
  create(_data: CreateEmployeeData): Promise<void> {
    return Promise.resolve();
  }
  findProfileBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  setServiceStatus(): Promise<void> {
    return Promise.resolve();
  }
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
  activateWithBarcode(selfId: string): Promise<void> {
    this.activated.push(selfId);
    return Promise.resolve();
  }
}

class FakeBarcode implements BarcodeService {
  generate(selfId: string): string {
    return `v1.${selfId}.sig`;
  }
  verify(): string | null {
    return null;
  }
}

function emp(selfId: string): Employee {
  return new Employee(selfId, 'Name', 'IT', 'civilian', 'active', false);
}

function make(existing: Record<string, Employee> = {}) {
  const repo = new FakeEmployees(existing);
  const activate = new ActivateEmployeeAccountUseCase(repo, new FakeBarcode());
  const uc = new BulkActivateEmployeesUseCase(activate);
  return { uc, repo };
}

describe('BulkActivateEmployeesUseCase', () => {
  it('forbids a role that cannot activate employees (guard)', async () => {
    const { uc, repo } = make();
    await expect(
      uc.execute({ actingRole: 'guard', actingUserId: 'u1', selfIds: ['E-1'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.activated).toHaveLength(0);
  });

  it('rejects a batch over the hard size cap', async () => {
    const { uc } = make();
    const selfIds = Array.from({ length: 1001 }, (_, i) => `E-${i}`);
    await expect(
      uc.execute({ actingRole: 'hr', actingUserId: 'u1', selfIds }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('activates all existing employees', async () => {
    const { uc, repo } = make({ 'E-1': emp('E-1'), 'E-2': emp('E-2') });
    const res = await uc.execute({
      actingRole: 'hr',
      actingUserId: 'u1',
      selfIds: ['E-1', 'E-2'],
    });
    expect(res.activated).toBe(2);
    expect(res.failed).toHaveLength(0);
    expect(repo.activated).toEqual(['E-1', 'E-2']);
  });

  it('reports a missing employee as not found', async () => {
    const { uc } = make({ 'E-1': emp('E-1') });
    const res = await uc.execute({
      actingRole: 'hr',
      actingUserId: 'u1',
      selfIds: ['E-1', 'E-GONE'],
    });
    expect(res.activated).toBe(1);
    expect(res.failed).toEqual([
      { selfId: 'E-GONE', code: 'EMPLOYEE_NOT_FOUND' },
    ]);
  });

  it('de-duplicates repeated self ids (processed once)', async () => {
    const { uc, repo } = make({ 'E-1': emp('E-1') });
    const res = await uc.execute({
      actingRole: 'supervisor',
      actingUserId: 'u1',
      selfIds: ['E-1', 'E-1', '  E-1  '],
    });
    expect(res.activated).toBe(1);
    expect(repo.activated).toEqual(['E-1']);
  });
});
