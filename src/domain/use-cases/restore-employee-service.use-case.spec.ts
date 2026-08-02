import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Employee, ServiceStatus } from '../entities/employee.entity';
import {
  CreateEmployeeData,
  EmployeeRepository,
} from '../repositories/employee.repository';
import { AuditEntry, AuditLogger } from '../services/audit.logger';
import { RestoreEmployeeServiceUseCase } from './restore-employee-service.use-case';

class FakeEmployees implements EmployeeRepository {
  // Pre-existing fake completeness: EmployeeRepository read method (unused here).
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  public calls: {
    selfId: string;
    status: ServiceStatus;
    date: Date | null;
    note: string | null;
  }[] = [];
  constructor(private readonly byId: Record<string, Employee> = {}) {}
  findByEmployeeId(id: string): Promise<Employee | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
  findById(): Promise<Employee | null> {
    return Promise.resolve(null);
  }
  isBanned(): Promise<boolean> {
    return Promise.resolve(false);
  }
  create(_d: CreateEmployeeData): Promise<void> {
    return Promise.resolve();
  }
  findProfileBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
  activateWithBarcode(): Promise<void> {
    return Promise.resolve();
  }
  setServiceStatus(
    selfId: string,
    status: ServiceStatus,
    date: Date | null,
    note: string | null,
  ): Promise<void> {
    this.calls.push({ selfId, status, date, note });
    return Promise.resolve();
  }
}

class FakeAudit implements AuditLogger {
  public entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

// An employee currently out of service (discharged) — the 13-arg form sets the
// service fields directly.
const discharged = new Employee(
  'E-1',
  'Omar',
  'Ops',
  'military',
  'active',
  false,
  null,
  null,
  null,
  null,
  'discharged',
  new Date('2020-01-01T00:00:00.000Z'),
  'note',
);

function make(byId: Record<string, Employee> = { 'E-1': discharged }) {
  const employees = new FakeEmployees(byId);
  const audit = new FakeAudit();
  const uc = new RestoreEmployeeServiceUseCase(employees, audit);
  return { uc, employees, audit };
}

describe('RestoreEmployeeServiceUseCase', () => {
  it('forbids a role outside super_admin/branch_head/hr', async () => {
    const { uc, employees } = make();
    await expect(
      uc.execute({ actingRole: 'guard', actingUserId: 'u', selfId: 'E-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(employees.calls).toHaveLength(0);
  });

  it('throws not found for a missing employee', async () => {
    const { uc } = make();
    await expect(
      uc.execute({ actingRole: 'hr', actingUserId: 'u', selfId: 'GONE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restores to active, clearing date + note, and audits', async () => {
    const { uc, employees, audit } = make();
    await uc.execute({ actingRole: 'hr', actingUserId: 'u1', selfId: 'E-1' });
    expect(employees.calls).toEqual([
      { selfId: 'E-1', status: 'active', date: null, note: null },
    ]);
    expect(audit.entries[0]).toMatchObject({
      type: 'service_restore',
      subjectType: 'employee',
      result: 'success',
    });
  });
})
