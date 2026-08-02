import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Employee, ServiceStatus } from '../entities/employee.entity';
import {
  CreateEmployeeData,
  EmployeeRepository,
} from '../repositories/employee.repository';
import { AuditEntry, AuditLogger } from '../services/audit.logger';
import { RecordEmployeeServiceExitUseCase } from './record-employee-service-exit.use-case';

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

const military = new Employee('E-M', 'Omar', 'Ops', 'military', 'active', false);
const civilian = new Employee('E-C', 'Sara', 'IT', 'civilian', 'active', false);

function make(byId: Record<string, Employee> = { 'E-M': military, 'E-C': civilian }) {
  const employees = new FakeEmployees(byId);
  const audit = new FakeAudit();
  const uc = new RecordEmployeeServiceExitUseCase(employees, audit);
  return { uc, employees, audit };
}

const PAST = '2020-01-01';
const FUTURE = '2999-12-31';

describe('RecordEmployeeServiceExitUseCase', () => {
  it('forbids a role outside super_admin/branch_head/hr', async () => {
    const { uc, employees } = make();
    await expect(
      uc.execute({
        actingRole: 'supervisor',
        actingUserId: 'u',
        selfId: 'E-C',
        serviceStatus: 'transferred',
        exitDate: PAST,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(employees.calls).toHaveLength(0);
  });

  it('rejects a future exit date', async () => {
    const { uc, employees } = make();
    await expect(
      uc.execute({
        actingRole: 'hr',
        actingUserId: 'u',
        selfId: 'E-C',
        serviceStatus: 'transferred',
        exitDate: FUTURE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(employees.calls).toHaveLength(0);
  });

  it('throws not found for a missing employee', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'hr',
        actingUserId: 'u',
        selfId: 'GONE',
        serviceStatus: 'transferred',
        exitDate: PAST,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids discharging a civilian', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'hr',
        actingUserId: 'u',
        selfId: 'E-C',
        serviceStatus: 'discharged',
        exitDate: PAST,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids ending the contract of a military member', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'hr',
        actingUserId: 'u',
        selfId: 'E-M',
        serviceStatus: 'contract_ended',
        exitDate: PAST,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('discharges a military member (records status + date + note + audit)', async () => {
    const { uc, employees, audit } = make();
    await uc.execute({
      actingRole: 'hr',
      actingUserId: 'u1',
      selfId: 'E-M',
      serviceStatus: 'discharged',
      exitDate: PAST,
      note: '  تسريح  ',
    });
    expect(employees.calls).toHaveLength(1);
    const c = employees.calls[0];
    expect(c.selfId).toBe('E-M');
    expect(c.status).toBe('discharged');
    expect(c.date?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(c.note).toBe('تسريح'); // trimmed
    expect(audit.entries[0]).toMatchObject({
      type: 'service_exit',
      subjectType: 'employee',
      result: 'success',
    });
  });

  it('ends the contract of a civilian', async () => {
    const { uc, employees } = make();
    await uc.execute({
      actingRole: 'branch_head',
      actingUserId: 'u',
      selfId: 'E-C',
      serviceStatus: 'contract_ended',
      exitDate: PAST,
    });
    expect(employees.calls[0].status).toBe('contract_ended');
  });

  it('transfers either personnel type', async () => {
    const { uc, employees } = make();
    await uc.execute({
      actingRole: 'hr',
      actingUserId: 'u',
      selfId: 'E-M',
      serviceStatus: 'transferred',
      exitDate: PAST,
    });
    await uc.execute({
      actingRole: 'hr',
      actingUserId: 'u',
      selfId: 'E-C',
      serviceStatus: 'transferred',
      exitDate: PAST,
    });
    expect(employees.calls.map((c) => c.status)).toEqual([
      'transferred',
      'transferred',
    ]);
  });
});
