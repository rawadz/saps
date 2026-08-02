import { ForbiddenException } from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import { EmployeeRepository } from '../repositories/employee.repository';
import { RefreshPayload, TokenService } from '../services/token.service';
import { EmployeeLoginUseCase } from './employee-login.use-case';

class FakeEmployees implements EmployeeRepository {
  public lookups = 0;
  // Pre-existing fake completeness: EmployeeRepository read method (unused here).
  findBarcodeViewBySelfId(): Promise<null> {
    return Promise.resolve(null);
  }
  constructor(private readonly byId: Record<string, Employee>) {}
  findByEmployeeId(id: string): Promise<Employee | null> {
    this.lookups += 1;
    return Promise.resolve(this.byId[id] ?? null);
  }
  findById(id: string): Promise<Employee | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
  isBanned(id: string): Promise<boolean> {
    return Promise.resolve(this.byId[id]?.isEntryBlocked ?? false);
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
  activateWithBarcode(): Promise<void> {
    return Promise.resolve();
  }
  setEntryBlocked(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeTokens implements TokenService {
  public lastEmployeeId?: string;
  public refreshSigned = false;
  signEmployeeAccess(selfId: string): Promise<string> {
    this.lastEmployeeId = selfId;
    return Promise.resolve(`emp-token:${selfId}`);
  }
  signAdminAccess(): Promise<string> {
    return Promise.resolve('admin-token');
  }
  signRefresh(): Promise<string> {
    this.refreshSigned = true;
    return Promise.resolve('refresh-token');
  }
  verifyRefresh(): Promise<RefreshPayload | null> {
    return Promise.resolve(null);
  }
}

// Phase 1: employee login is feature-gated OFF (EMPLOYEE_LOGIN_ENABLED = false in the
// use-case). Every attempt must be refused up front — before any DB or token work — so
// the disabled path can never leak a token. The full enabled flow is kept in the
// use-case for re-enabling; these tests pin the gate.
describe('EmployeeLoginUseCase (feature-gated OFF)', () => {
  const active = new Employee('E-1001', 'Sara', 'IT', 'civilian', 'active', false);

  it('refuses even a valid, active employee with EMPLOYEE_LOGIN_DISABLED and issues no token', async () => {
    const employees = new FakeEmployees({ 'E-1001': active });
    const tokens = new FakeTokens();
    const uc = new EmployeeLoginUseCase(employees, tokens);

    await expect(uc.execute('E-1001')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(uc.execute('E-1001')).rejects.toThrow('EMPLOYEE_LOGIN_DISABLED');
    // The gate short-circuits before any repo lookup or token signing.
    expect(employees.lookups).toBe(0);
    expect(tokens.lastEmployeeId).toBeUndefined();
    expect(tokens.refreshSigned).toBe(false);
  });

  it('refuses a malformed id with the same disabled gate (gate precedes validation)', async () => {
    const uc = new EmployeeLoginUseCase(new FakeEmployees({}), new FakeTokens());
    await expect(uc.execute('!!')).rejects.toThrow('EMPLOYEE_LOGIN_DISABLED');
  });
});
