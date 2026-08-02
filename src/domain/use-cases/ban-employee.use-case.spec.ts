import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import { EmployeeRepository } from '../repositories/employee.repository';
import { AuditEntry, AuditLogger } from '../services/audit.logger';
import { BanListCache } from '../services/ban-list.cache';
import { BanEmployeeUseCase } from './ban-employee.use-case';

class FakeEmployees implements EmployeeRepository {
  // Pre-existing fake completeness: EmployeeRepository read method (unused here).
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  public blocked: { selfId: string; blocked: boolean }[] = [];
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
  create(): Promise<void> {
    return Promise.resolve();
  }
  findProfileBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  setServiceStatus(): Promise<void> {
    return Promise.resolve();
  }
  setEntryBlocked(selfId: string, blocked: boolean): Promise<void> {
    this.blocked.push({ selfId, blocked });
    return Promise.resolve();
  }
  activateWithBarcode(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeBanList implements BanListCache {
  public added: string[] = [];
  add(selfId: string): Promise<void> {
    this.added.push(selfId);
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  isBanned(): Promise<boolean> {
    return Promise.resolve(false);
  }
  rehydrate(): Promise<void> {
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

const emp = new Employee('E-1001', 'Sara', 'IT', 'civilian', 'active', false);

describe('BanEmployeeUseCase', () => {
  function make(byId: Record<string, Employee> = { 'E-1001': emp }) {
    const employees = new FakeEmployees(byId);
    const banList = new FakeBanList();
    const audit = new FakeAudit();
    const uc = new BanEmployeeUseCase(employees, banList, audit);
    return { uc, employees, banList, audit };
  }

  it('forbids a guard from banning', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'guard',
        actingUserId: 'g1',
        selfId: 'E-1001',
        reason: 'tailgating attempt',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a reason of at least 3 characters', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'supervisor',
        actingUserId: 's1',
        selfId: 'E-1001',
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the employee does not exist', async () => {
    const { uc } = make({});
    await expect(
      uc.execute({
        actingRole: 'supervisor',
        actingUserId: 's1',
        selfId: 'E-9999',
        reason: 'valid reason',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bans: flips the DB flag, updates Redis, and audits with the reason', async () => {
    const { uc, employees, banList, audit } = make();
    await uc.execute({
      actingRole: 'branch_head',
      actingUserId: 'bh1',
      selfId: 'E-1001',
      reason: 'security incident',
    });
    expect(employees.blocked).toEqual([{ selfId: 'E-1001', blocked: true }]);
    expect(banList.added).toEqual(['E-1001']);
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_block',
      reason: 'security incident',
      result: 'success',
    });
  });
});
