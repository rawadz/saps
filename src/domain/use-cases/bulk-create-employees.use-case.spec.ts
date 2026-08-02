import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Employee, PersonnelType } from '../entities/employee.entity';
import {
  CreateEmployeeData,
  EmployeeRepository,
} from '../repositories/employee.repository';
import {
  EmployeeRowValidation,
  EmployeeRowValidator,
} from '../services/employee-row-validator';
import { BarcodeService } from '../services/barcode.service';
import { CreateEmployeeUseCase } from './create-employee.use-case';
import { BulkCreateEmployeesUseCase } from './bulk-create-employees.use-case';

class FakeBarcode implements BarcodeService {
  generate(employeeId: string): string {
    return `token-for-${employeeId}`;
  }
  verify(): string | null {
    return null;
  }
}

class FakeEmployees implements EmployeeRepository {
  public created: CreateEmployeeData[] = [];
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
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
  activateWithBarcode(): Promise<void> {
    return Promise.resolve();
  }
}

// Controllable validator: a row with `{ bad: true, code }` fails; otherwise it
// passes and yields CreateEmployeeData from the row's fields.
class FakeRowValidator implements EmployeeRowValidator {
  validate(row: unknown): EmployeeRowValidation {
    const r = (row ?? {}) as Record<string, unknown>
    if (r.bad) return { ok: false, code: (r.code as string) ?? 'INVALID_VALUE' }
    return {
      ok: true,
      data: {
        selfId: r.selfId as string,
        fullName: r.fullName as string,
        personnelType: (r.personnelType as PersonnelType) ?? 'civilian',
      },
    }
  }
}

function make(existing: Record<string, Employee> = {}) {
  const repo = new FakeEmployees(existing)
  const createEmployee = new CreateEmployeeUseCase(repo, new FakeBarcode())
  const uc = new BulkCreateEmployeesUseCase(createEmployee, new FakeRowValidator())
  return { uc, repo }
}

function row(selfId: string, fullName = 'Name', extra: object = {}) {
  return { selfId, fullName, personnelType: 'civilian', ...extra }
}

describe('BulkCreateEmployeesUseCase', () => {
  it('forbids a role that cannot manage employees (guard)', async () => {
    const { uc, repo } = make()
    await expect(
      uc.execute({ actingRole: 'guard', items: [row('E-1')] }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(repo.created).toHaveLength(0)
  })

  it('rejects a batch over the hard size cap', async () => {
    const { uc } = make()
    const items = Array.from({ length: 1001 }, (_, i) => row(`E-${i}`))
    await expect(
      uc.execute({ actingRole: 'hr', items }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('creates all valid rows and lists them', async () => {
    const { uc, repo } = make()
    const res = await uc.execute({
      actingRole: 'hr',
      items: [row('E-1', 'Sara'), row('E-2', 'Omar')],
    })
    expect(res.created).toBe(2)
    expect(res.failed).toHaveLength(0)
    expect(res.createdItems).toEqual([
      { selfId: 'E-1', fullName: 'Sara' },
      { selfId: 'E-2', fullName: 'Omar' },
    ])
    expect(repo.created).toHaveLength(2)
  })

  it('flags an in-file duplicate self id (first created, repeat failed)', async () => {
    const { uc, repo } = make()
    const res = await uc.execute({
      actingRole: 'hr',
      items: [row('E-1'), row('E-1')],
    })
    expect(res.created).toBe(1)
    expect(repo.created).toHaveLength(1)
    expect(res.failed).toEqual([
      { index: 1, selfId: 'E-1', code: 'SELF_ID_DUPLICATED_IN_FILE' },
    ])
  })

  it('flags a duplicate that already exists in the database', async () => {
    const existing = {
      'E-9': new Employee('E-9', 'Old', 'IT', 'civilian', 'active', false),
    }
    const { uc } = make(existing)
    const res = await uc.execute({ actingRole: 'hr', items: [row('E-9')] })
    expect(res.created).toBe(0)
    expect(res.failed).toEqual([
      { index: 0, selfId: 'E-9', code: 'EMPLOYEE_ALREADY_EXISTS' },
    ])
  })

  it('skips a row that fails validation, with the validator code', async () => {
    const { uc, repo } = make()
    const res = await uc.execute({
      actingRole: 'hr',
      items: [
        { bad: true, code: 'INVALID_PERSONNEL_TYPE', selfId: 'E-BAD' },
        row('E-2', 'Omar'),
      ],
    })
    expect(res.created).toBe(1)
    expect(repo.created).toHaveLength(1)
    expect(res.failed).toEqual([
      { index: 0, selfId: 'E-BAD', code: 'INVALID_PERSONNEL_TYPE' },
    ])
  })

  it('builds a mixed report without stopping at the first error', async () => {
    const existing = {
      'E-DB': new Employee('E-DB', 'X', 'IT', 'civilian', 'active', false),
    }
    const { uc } = make(existing)
    const res = await uc.execute({
      actingRole: 'supervisor',
      items: [
        row('E-OK', 'Good'), // created
        { bad: true, selfId: null }, // validation fail
        row('E-DUP'), // created
        row('E-DUP'), // in-file dup
        row('E-DB'), // db dup
      ],
    })
    expect(res.created).toBe(2)
    expect(res.createdItems.map((c) => c.selfId)).toEqual(['E-OK', 'E-DUP'])
    expect(res.failed).toEqual([
      { index: 1, selfId: null, code: 'INVALID_VALUE' },
      { index: 3, selfId: 'E-DUP', code: 'SELF_ID_DUPLICATED_IN_FILE' },
      { index: 4, selfId: 'E-DB', code: 'EMPLOYEE_ALREADY_EXISTS' },
    ])
  })
})
