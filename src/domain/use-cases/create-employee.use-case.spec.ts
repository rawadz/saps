import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import {
  CreateEmployeeData,
  EmployeeRepository,
} from '../repositories/employee.repository';
import { BarcodeService } from '../services/barcode.service';
import { CreateEmployeeUseCase } from './create-employee.use-case';

class FakeEmployees implements EmployeeRepository {
  public created: CreateEmployeeData[] = [];
  public activated: { selfId: string; token: string; userId?: string }[] = [];
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
  create(data: CreateEmployeeData): Promise<void> {
    this.created.push(data);
    return Promise.resolve();
  }
  findProfileBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  setServiceStatus(): Promise<void> {
    return Promise.resolve();
  }
  activateWithBarcode(
    selfId: string,
    token: string,
    userId?: string,
  ): Promise<void> {
    this.activated.push({ selfId, token, userId });
    return Promise.resolve();
  }
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeBarcode implements BarcodeService {
  generate(employeeId: string): string {
    return `token-for-${employeeId}`;
  }
  verify(): string | null {
    return null;
  }
}

function makeUc(existing: Record<string, Employee> = {}) {
  const repo = new FakeEmployees(existing);
  const uc = new CreateEmployeeUseCase(repo, new FakeBarcode());
  return { uc, repo };
}

const baseData: CreateEmployeeData = {
  selfId: 'E-1001',
  fullName: 'Sara Q.',
  personnelType: 'civilian',
};

describe('CreateEmployeeUseCase', () => {
  it('forbids a role that cannot manage employees (guard)', async () => {
    const { uc, repo } = makeUc();
    await expect(
      uc.execute({ actingRole: 'guard', data: baseData }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.created).toHaveLength(0);
    expect(repo.activated).toHaveLength(0);
  });

  it('rejects an invalid self id', async () => {
    const { uc } = makeUc();
    await expect(
      uc.execute({ actingRole: 'hr', data: { ...baseData, selfId: '!!' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate employee', async () => {
    const existing = {
      'E-1001': new Employee('E-1001', 'Sara', 'IT', 'civilian', 'active', false),
    };
    const { uc } = makeUc(existing);
    await expect(
      uc.execute({ actingRole: 'hr', data: baseData }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates AND activates the employee (active by default) with the barcode', async () => {
    const { uc, repo } = makeUc();
    await uc.execute({ actingRole: 'hr', data: baseData, actingUserId: 'admin-1' });
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0].selfId).toBe('E-1001');
    // Active by default: activation ran with the generated barcode + acting user.
    expect(repo.activated).toEqual([
      { selfId: 'E-1001', token: 'token-for-E-1001', userId: 'admin-1' },
    ]);
  });

  it('activates with a null generated_by when no acting user id is given (bulk path)', async () => {
    const { uc, repo } = makeUc();
    await uc.execute({ actingRole: 'hr', data: baseData });
    expect(repo.activated[0].userId).toBeUndefined();
  });
});
