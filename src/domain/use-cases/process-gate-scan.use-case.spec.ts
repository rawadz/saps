import { Employee } from '../entities/employee.entity';
import { Gate } from '../entities/gate.entity';
import { Permit, PermitProps } from '../entities/permit.entity';
import {
  VehiclePermit,
  VehiclePermitProps,
} from '../entities/vehicle-permit.entity';
import { EmployeeRepository } from '../repositories/employee.repository';
import { GateAccessRepository } from '../repositories/gate-access.repository';
import { GateRepository } from '../repositories/gate.repository';
import { PermitRepository } from '../repositories/permit.repository';
import { VehiclePermitRepository } from '../repositories/vehicle-permit.repository';
import { AuditEntry, AuditLogger } from '../services/audit.logger';
import { BanListCache } from '../services/ban-list.cache';
import { BarcodeService } from '../services/barcode.service';
import { GuardGateService } from '../services/guard-gate.service';
import { ProcessGateScanUseCase } from './process-gate-scan.use-case';

class FakeEmployees implements EmployeeRepository {
  public lookups = 0;
  public findByIdCalls: string[] = [];
  constructor(
    private readonly bySelfId: Record<string, Employee> = {},
    private readonly byUuid: Record<string, Employee> = {},
  ) {}
  findByEmployeeId(id: string): Promise<Employee | null> {
    this.lookups++;
    return Promise.resolve(this.bySelfId[id] ?? null);
  }
  findById(id: string): Promise<Employee | null> {
    // Keyed by internal UUID — the foreign key a vehicle permit stores.
    this.findByIdCalls.push(id);
    return Promise.resolve(this.byUuid[id] ?? null);
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
  // Admin barcode-view lookup (contract added in phase 3-a). Not exercised by these
  // tests → inert stub returning null.
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

class FakePermits implements PermitRepository {
  public consumeCalls: string[] = [];
  public findByIdCalls: string[] = [];
  constructor(
    private readonly opts: {
      byNumber?: Record<string, Permit>;
      byUuid?: Record<string, Permit>;
      consumeResult?: boolean;
    } = {},
  ) {}
  nextPermitNumber(): Promise<string> {
    return Promise.resolve('VP-X');
  }
  create(): Promise<void> {
    return Promise.resolve();
  }
  findByPermitNumber(permitNumber: string): Promise<Permit | null> {
    return Promise.resolve(this.opts.byNumber?.[permitNumber] ?? null);
  }
  findById(id: string): Promise<Permit | null> {
    // Keyed by internal UUID — the parent permit a vehicle inherits from.
    this.findByIdCalls.push(id);
    return Promise.resolve(this.opts.byUuid?.[id] ?? null);
  }
  consumeSingleEntry(permitNumber: string): Promise<boolean> {
    this.consumeCalls.push(permitNumber);
    return Promise.resolve(this.opts.consumeResult ?? true);
  }
}

class FakeVehiclePermits implements VehiclePermitRepository {
  constructor(private readonly byId: Record<string, VehiclePermit> = {}) {}
  resolveEmployeeId(): Promise<string | null> {
    return Promise.resolve(null);
  }
  resolveVisitorPermitId(): Promise<string | null> {
    return Promise.resolve(null);
  }
  create(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'v-new' });
  }
  setBarcodeToken(): Promise<void> {
    return Promise.resolve();
  }
  findById(id: string): Promise<VehiclePermit | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
}

class FakeBarcodes implements BarcodeService {
  constructor(private readonly tokens: Record<string, string | null>) {}
  generate(selfId: string): string {
    return `v1.${selfId}.sig`;
  }
  verify(token: string): string | null {
    return token in this.tokens ? this.tokens[token] : null;
  }
}

class FakeBanList implements BanListCache {
  constructor(private readonly banned: Set<string> = new Set()) {}
  add(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  isBanned(selfId: string): Promise<boolean> {
    return Promise.resolve(this.banned.has(selfId));
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

// Guard's pinned station. Defaults to null (no station) → gate resolution and the
// per-gate authorization branch stay dormant, exactly as before Phase 4.
class FakeGuardGate implements GuardGateService {
  constructor(private readonly boundGateId: string | null = null) {}
  setGuardGate(): Promise<void> {
    return Promise.resolve();
  }
  getGuardGate(): Promise<string | null> {
    return Promise.resolve(this.boundGateId);
  }
  clear(): Promise<void> {
    return Promise.resolve();
  }
}

// Gate lookup by id. Empty map by default → findById returns null.
class FakeGates implements GateRepository {
  constructor(private readonly byId: Record<string, Gate> = {}) {}
  create(): Promise<void> {
    return Promise.resolve();
  }
  findById(id: string): Promise<Gate | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
  findByName(): Promise<Gate | null> {
    return Promise.resolve(null);
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
}

// Employee↔gate grants. Empty by default → no grants, so under the optional-
// restriction policy the employee is unrestricted (passes on canEnter alone).
class FakeGateAccess implements GateAccessRepository {
  constructor(private readonly granted: Record<string, string[]> = {}) {}
  setGatesForEmployee(): Promise<void> {
    return Promise.resolve();
  }
  getGateIdsForEmployee(selfId: string): Promise<string[]> {
    return Promise.resolve(this.granted[selfId] ?? []);
  }
  hasAnyGateAccess(selfId: string): Promise<boolean> {
    return Promise.resolve((this.granted[selfId] ?? []).length > 0);
  }
  hasGateAccess(selfId: string, gateId: string): Promise<boolean> {
    return Promise.resolve((this.granted[selfId] ?? []).includes(gateId));
  }
}

const active = new Employee(
  'E-1001',
  'Sara',
  'IT',
  'civilian',
  'active',
  false,
);
const suspended = new Employee(
  'E-2002',
  'Omar',
  'Ops',
  'military',
  'suspended',
  false,
);
const blockedInDb = new Employee(
  'E-3003',
  'Lina',
  'HR',
  'civilian',
  'active',
  true,
);

// ── Expected SAFE display blocks ─────────────────────────────────────────────
// These mirror the use-case's mappers. Because every result is checked with an
// EXACT toEqual, these constants double as a leak guard: any extra/sensitive field
// in the real subject would fail the match.
const activeInfo = {
  kind: 'employee',
  fullName: 'Sara',
  commandDepartment: 'IT',
  branch: null,
  priority: null,
  personnelType: 'civilian',
  rank: null,
  currentJobTitle: null,
  serviceStatus: 'active',
  serviceExitDate: null,
  serviceExitNote: null,
};
const suspendedInfo = {
  kind: 'employee',
  fullName: 'Omar',
  commandDepartment: 'Ops',
  branch: null,
  priority: null,
  personnelType: 'military',
  rank: null,
  currentJobTitle: null,
  serviceStatus: 'active',
  serviceExitDate: null,
  serviceExitNote: null,
};
const blockedInfo = {
  kind: 'employee',
  fullName: 'Lina',
  commandDepartment: 'HR',
  branch: null,
  priority: null,
  personnelType: 'civilian',
  rank: null,
  currentJobTitle: null,
  serviceStatus: 'active',
  serviceExitDate: null,
  serviceExitNote: null,
};
// Default makePermit -> single-entry visitor 'Zaid' / host 'IT'.
const zaidSE = {
  kind: 'visitor',
  visitorName: 'Zaid',
  permitType: 'single_entry',
  host: 'IT',
  reason: null,
  personnelType: null,
  startDate: null,
  endDate: null,
};
function zaidScheduled(startISO: string, endISO: string) {
  return {
    kind: 'visitor',
    visitorName: 'Zaid',
    permitType: 'scheduled',
    host: 'IT',
    reason: null,
    personnelType: null,
    startDate: startISO,
    endDate: endISO,
  };
}
function veh(ownerType: 'employee' | 'visitor', owner: unknown) {
  return {
    kind: 'vehicle',
    plateNumber: 'ABC-123',
    vehicleType: 'private',
    ownerType,
    owner,
  };
}

function makePermit(
  permitNumber: string,
  overrides: Partial<PermitProps> = {},
): Permit {
  return new Permit({
    id: 'pid',
    permitNumber,
    token: 'tok',
    permitType: 'single_entry',
    status: 'active',
    visitorName: 'Zaid',
    idOrPhone: null,
    personnelType: null,
    host: 'IT',
    reason: null,
    startDate: null,
    endDate: null,
    allowedDays: [],
    allowedTimeFrom: null,
    allowedTimeTo: null,
    expiresAt: null,
    usedAt: null,
    issuedBy: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    ...overrides,
  });
}

function makeVehicle(
  id: string,
  overrides: Partial<VehiclePermitProps> = {},
): VehiclePermit {
  return new VehiclePermit({
    id,
    plateNumber: 'ABC-123',
    vehicleType: 'private',
    color: null,
    make: null,
    model: null,
    barcodeToken: `v1.vehicle:${id}.sig`,
    status: 'active',
    expiresAt: null,
    employeeId: null,
    visitorPermitId: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    ...overrides,
  });
}

describe('ProcessGateScanUseCase', () => {
  function make(opts: {
    tokens: Record<string, string | null>;
    employees?: Record<string, Employee>; // keyed by self id (findByEmployeeId)
    employeesById?: Record<string, Employee>; // keyed by UUID (findById, vehicle owner)
    banned?: Set<string>;
    permits?: {
      byNumber?: Record<string, Permit>;
      byUuid?: Record<string, Permit>; // keyed by UUID (findById, vehicle owner)
      consumeResult?: boolean;
    };
    vehicles?: Record<string, VehiclePermit>; // keyed by UUID (findById)
    // Phase-4 options — all dormant by default so existing cases are unaffected.
    boundGateId?: string | null; // the guard's pinned station (null = none)
    gates?: Record<string, Gate>; // gate lookup by id
    grants?: Record<string, string[]>; // self id → granted gate ids
    enforced?: boolean; // GATE_ACCESS_ENFORCED flag (default false)
    strict?: boolean; // GATE_ACCESS_STRICT flag (default false)
  }) {
    const employees = new FakeEmployees(
      opts.employees ?? {},
      opts.employeesById ?? {},
    );
    const permits = new FakePermits(opts.permits ?? {});
    const vehicles = new FakeVehiclePermits(opts.vehicles ?? {});
    const audit = new FakeAudit();
    const uc = new ProcessGateScanUseCase(
      new FakeBarcodes(opts.tokens),
      employees,
      permits,
      vehicles,
      new FakeBanList(opts.banned ?? new Set()),
      audit,
      new FakeGuardGate(opts.boundGateId ?? null),
      new FakeGates(opts.gates ?? {}),
      new FakeGateAccess(opts.grants ?? {}),
      opts.enforced ?? false,
      opts.strict ?? false,
    );
    return { uc, employees, permits, vehicles, audit };
  }

  // ── Employee path ──────────────────────────────────────────────────────────
  it('rejects a forged token (RED + audit, no DB lookup, no subject)', async () => {
    const { uc, employees, audit } = make({ tokens: { bad: null } });
    const res = await uc.execute('bad', 'guard-1');
    expect(res).toEqual({
      result: 'RED',
      reason: 'INVALID_BARCODE',
      subject: null,
    });
    expect(employees.lookups).toBe(0);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_denied',
      result: 'failure',
      reason: 'INVALID_BARCODE',
    });
  });

  it('rejects a banned employee (Redis decision) and still shows their data for the guard', async () => {
    const { uc, employees, audit } = make({
      tokens: { tok: 'E-1001' },
      employees: { 'E-1001': active },
      banned: new Set(['E-1001']),
    });
    const res = await uc.execute('tok', 'guard-1');
    expect(res).toEqual({
      result: 'RED',
      reason: 'BANNED',
      subject: activeInfo,
    });
    // The DECISION is Redis-authoritative; the single read is DISPLAY-only.
    expect(employees.lookups).toBe(1);
    expect(audit.entries[0]).toMatchObject({
      reason: 'BANNED',
      result: 'failure',
    });
  });

  it('rejects an unknown employee (no subject)', async () => {
    const { uc, audit } = make({ tokens: { tok: 'E-9999' } });
    await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'NOT_FOUND',
      subject: null,
    });
    expect(audit.entries[0]).toMatchObject({ reason: 'NOT_FOUND' });
  });

  it('rejects a non-active employee as INACTIVE (with data)', async () => {
    const { uc } = make({
      tokens: { tok: 'E-2002' },
      employees: { 'E-2002': suspended },
    });
    await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'INACTIVE',
      subject: suspendedInfo,
    });
  });

  it('rejects a DB-blocked employee as BANNED (with data)', async () => {
    const { uc } = make({
      tokens: { tok: 'E-3003' },
      employees: { 'E-3003': blockedInDb },
    });
    await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'BANNED',
      subject: blockedInfo,
    });
  });

  it('admits an active employee (GREEN + success audit + data)', async () => {
    const { uc, audit } = make({
      tokens: { tok: 'E-1001' },
      employees: { 'E-1001': active },
    });
    const res = await uc.execute('tok', 'guard-1');
    expect(res).toEqual({
      result: 'GREEN',
      subjectName: 'Sara',
      department: 'IT',
      subject: activeInfo,
    });
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_approved',
      result: 'success',
    });
  });

  // ── Visitor-permit branch ──────────────────────────────────────────────────
  it('admits a scheduled permit within its window (GREEN + permit audit + data)', async () => {
    const permit = makePermit('VP-SCH', {
      permitType: 'scheduled',
      status: 'active',
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      endDate: new Date('2999-12-31T00:00:00.000Z'),
    });
    const { uc, employees, audit } = make({
      tokens: { ptok: 'permit:VP-SCH' },
      permits: { byNumber: { 'VP-SCH': permit } },
    });

    const res = await uc.execute('ptok', 'guard-1');

    expect(res).toEqual({
      result: 'GREEN',
      subjectName: 'Zaid',
      department: 'IT',
      subject: zaidScheduled(
        '2020-01-01T00:00:00.000Z',
        '2999-12-31T00:00:00.000Z',
      ),
    });
    expect(employees.lookups).toBe(0); // never touches the employee path
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_approved',
      subjectType: 'permit',
      subjectRef: 'VP-SCH',
      result: 'success',
    });
  });

  it('rejects a scheduled permit outside its date window (RED + data)', async () => {
    const permit = makePermit('VP-OLD', {
      permitType: 'scheduled',
      status: 'active',
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      endDate: new Date('2020-12-31T00:00:00.000Z'),
    });
    const { uc, audit } = make({
      tokens: { ptok: 'permit:VP-OLD' },
      permits: { byNumber: { 'VP-OLD': permit } },
    });

    const res = await uc.execute('ptok', 'guard-1');

    expect(res).toEqual({
      result: 'RED',
      reason: 'OUT_OF_DATE_RANGE',
      subject: zaidScheduled(
        '2020-01-01T00:00:00.000Z',
        '2020-12-31T00:00:00.000Z',
      ),
    });
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_denied',
      subjectType: 'permit',
      subjectRef: 'VP-OLD',
      result: 'failure',
    });
  });

  it('admits an unused single-entry permit and consumes it (GREEN + data)', async () => {
    const permit = makePermit('VP-SE', {
      permitType: 'single_entry',
      status: 'active',
    });
    const { uc, permits, audit } = make({
      tokens: { ptok: 'permit:VP-SE' },
      permits: { byNumber: { 'VP-SE': permit }, consumeResult: true },
    });

    const res = await uc.execute('ptok', 'guard-1');

    expect(res).toEqual({
      result: 'GREEN',
      subjectName: 'Zaid',
      department: 'IT',
      subject: zaidSE,
    });
    expect(permits.consumeCalls).toEqual(['VP-SE']);
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_approved',
      subjectType: 'permit',
    });
  });

  it('rejects an already-used single-entry permit (RED + data, no consume attempt)', async () => {
    const permit = makePermit('VP-USED', {
      permitType: 'single_entry',
      status: 'used',
    });
    const { uc, permits } = make({
      tokens: { ptok: 'permit:VP-USED' },
      permits: { byNumber: { 'VP-USED': permit } },
    });

    const res = await uc.execute('ptok', 'guard-1');

    expect(res).toEqual({
      result: 'RED',
      reason: 'ALREADY_USED',
      subject: zaidSE,
    });
    expect(permits.consumeCalls).toHaveLength(0);
  });

  it('rejects a single-entry permit lost to a concurrent scan (consume returns false)', async () => {
    const permit = makePermit('VP-RACE', {
      permitType: 'single_entry',
      status: 'active',
    });
    const { uc } = make({
      tokens: { ptok: 'permit:VP-RACE' },
      permits: { byNumber: { 'VP-RACE': permit }, consumeResult: false },
    });

    await expect(uc.execute('ptok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'ALREADY_USED',
      subject: zaidSE,
    });
  });

  it('rejects an unknown permit (RED + audit, no subject)', async () => {
    const { uc, audit } = make({ tokens: { ptok: 'permit:VP-NONE' } });

    const res = await uc.execute('ptok', 'guard-1');

    expect(res).toEqual({
      result: 'RED',
      reason: 'PERMIT_NOT_FOUND',
      subject: null,
    });
    expect(audit.entries[0]).toMatchObject({
      subjectType: 'permit',
      reason: 'PERMIT_NOT_FOUND',
    });
  });

  // ── Vehicle branch ─────────────────────────────────────────────────────────
  it('rejects an unknown vehicle (RED VEHICLE_NOT_FOUND + audit, no subject)', async () => {
    const { uc, audit } = make({ tokens: { vtok: 'vehicle:V-NONE' } });

    const res = await uc.execute('vtok', 'guard-1');

    expect(res).toEqual({
      result: 'RED',
      reason: 'VEHICLE_NOT_FOUND',
      subject: null,
    });
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_denied',
      subjectType: 'vehicle',
      subjectRef: 'V-NONE',
      result: 'failure',
      reason: 'VEHICLE_NOT_FOUND',
    });
  });

  it('rejects a non-active vehicle permit before resolving the owner (VEHICLE_INACTIVE + vehicle-only data)', async () => {
    const vehicle = makeVehicle('V-REV', {
      status: 'revoked',
      employeeId: 'emp-uuid-1',
    });
    const { uc, employees } = make({
      tokens: { vtok: 'vehicle:V-REV' },
      vehicles: { 'V-REV': vehicle },
      employeesById: { 'emp-uuid-1': active },
    });

    const res = await uc.execute('vtok', 'guard-1');

    expect(res).toEqual({
      result: 'RED',
      reason: 'VEHICLE_INACTIVE',
      subject: veh('employee', null),
    });
    // The vehicle's own state short-circuits — the owner is never looked up.
    expect(employees.findByIdCalls).toHaveLength(0);
  });

  it('rejects an expired vehicle permit (VEHICLE_EXPIRED + vehicle-only data)', async () => {
    const vehicle = makeVehicle('V-EXP', {
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      employeeId: 'emp-uuid-1',
    });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-EXP' },
      vehicles: { 'V-EXP': vehicle },
      employeesById: { 'emp-uuid-1': active },
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'VEHICLE_EXPIRED',
      subject: veh('employee', null),
    });
  });

  it('admits an active employee-owned vehicle (GREEN with owner attribution + data)', async () => {
    const vehicle = makeVehicle('V-EMP', { employeeId: 'emp-uuid-1' });
    const { uc, employees, audit } = make({
      tokens: { vtok: 'vehicle:V-EMP' },
      vehicles: { 'V-EMP': vehicle },
      employeesById: { 'emp-uuid-1': active },
    });

    const res = await uc.execute('vtok', 'guard-1');

    expect(res).toEqual({
      result: 'GREEN',
      subjectName: 'Vehicle of: Sara',
      department: 'IT',
      subject: veh('employee', activeInfo),
    });
    // Resolved by UUID, never via the employee self-id path.
    expect(employees.findByIdCalls).toEqual(['emp-uuid-1']);
    expect(employees.lookups).toBe(0);
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_approved',
      subjectType: 'vehicle',
      subjectRef: 'V-EMP',
      result: 'success',
    });
  });

  it('rejects a banned employee-owned vehicle (OWNER_BANNED + data)', async () => {
    const vehicle = makeVehicle('V-BAN', { employeeId: 'emp-uuid-3' });
    const { uc, audit } = make({
      tokens: { vtok: 'vehicle:V-BAN' },
      vehicles: { 'V-BAN': vehicle },
      employeesById: { 'emp-uuid-3': blockedInDb },
    });

    const res = await uc.execute('vtok', 'guard-1');

    expect(res).toEqual({
      result: 'RED',
      reason: 'OWNER_BANNED',
      subject: veh('employee', blockedInfo),
    });
    expect(audit.entries[0]).toMatchObject({
      subjectType: 'vehicle',
      subjectRef: 'V-BAN',
      reason: 'OWNER_BANNED',
    });
  });

  it('rejects a suspended employee-owned vehicle (OWNER_INACTIVE + data)', async () => {
    const vehicle = makeVehicle('V-SUS', { employeeId: 'emp-uuid-2' });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-SUS' },
      vehicles: { 'V-SUS': vehicle },
      employeesById: { 'emp-uuid-2': suspended },
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'OWNER_INACTIVE',
      subject: veh('employee', suspendedInfo),
    });
  });

  it('rejects an employee-owned vehicle whose owner is missing (OWNER_NOT_FOUND, vehicle-only data)', async () => {
    const vehicle = makeVehicle('V-ORPHAN', { employeeId: 'emp-missing' });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-ORPHAN' },
      vehicles: { 'V-ORPHAN': vehicle },
      // no employeesById entry for 'emp-missing'
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'OWNER_NOT_FOUND',
      subject: veh('employee', null),
    });
  });

  it('admits a visitor-permit-owned vehicle WITHOUT consuming the permit (GREEN + data)', async () => {
    const permit = makePermit('VP-SE', {
      permitType: 'single_entry',
      status: 'active',
    });
    const vehicle = makeVehicle('V-VIS', { visitorPermitId: 'perm-uuid-1' });
    const { uc, permits, audit } = make({
      tokens: { vtok: 'vehicle:V-VIS' },
      vehicles: { 'V-VIS': vehicle },
      permits: { byUuid: { 'perm-uuid-1': permit } },
    });

    const res = await uc.execute('vtok', 'guard-1');

    expect(res).toEqual({
      result: 'GREEN',
      subjectName: 'Visitor vehicle: Zaid',
      department: 'IT',
      subject: veh('visitor', zaidSE),
    });
    // The crux: a vehicle scan NEVER consumes the owner's single-entry permit.
    expect(permits.consumeCalls).toHaveLength(0);
    expect(permits.findByIdCalls).toEqual(['perm-uuid-1']);
    expect(audit.entries[0]).toMatchObject({
      type: 'entry_check_approved',
      subjectType: 'vehicle',
      subjectRef: 'V-VIS',
      result: 'success',
    });
  });

  it('admits a vehicle whose single-entry permit is already USED (lenient, still no consume)', async () => {
    const permit = makePermit('VP-USED', {
      permitType: 'single_entry',
      status: 'used',
      usedAt: new Date('2026-06-19T00:00:00.000Z'),
    });
    const vehicle = makeVehicle('V-USED', { visitorPermitId: 'perm-used' });
    const { uc, permits } = make({
      tokens: { vtok: 'vehicle:V-USED' },
      vehicles: { 'V-USED': vehicle },
      permits: { byUuid: { 'perm-used': permit } },
    });

    const res = await uc.execute('vtok', 'guard-1');

    expect(res).toEqual({
      result: 'GREEN',
      subjectName: 'Visitor vehicle: Zaid',
      department: 'IT',
      subject: veh('visitor', zaidSE),
    });
    expect(permits.consumeCalls).toHaveLength(0);
  });

  it('rejects a vehicle whose visitor permit is cancelled (CANCELLED + data, no consume)', async () => {
    const permit = makePermit('VP-CAN', {
      permitType: 'single_entry',
      status: 'cancelled',
    });
    const vehicle = makeVehicle('V-CAN', { visitorPermitId: 'perm-can' });
    const { uc, permits } = make({
      tokens: { vtok: 'vehicle:V-CAN' },
      vehicles: { 'V-CAN': vehicle },
      permits: { byUuid: { 'perm-can': permit } },
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'CANCELLED',
      subject: veh('visitor', zaidSE),
    });
    expect(permits.consumeCalls).toHaveLength(0);
  });

  it('rejects a vehicle whose single-entry permit is past expiry (EXPIRED + data)', async () => {
    const permit = makePermit('VP-PEXP', {
      permitType: 'single_entry',
      status: 'active',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const vehicle = makeVehicle('V-PEXP', { visitorPermitId: 'perm-pexp' });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-PEXP' },
      vehicles: { 'V-PEXP': vehicle },
      permits: { byUuid: { 'perm-pexp': permit } },
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'EXPIRED',
      subject: veh('visitor', zaidSE),
    });
  });

  it('mirrors a scheduled owner-permit OUTSIDE its window for the vehicle (RED + data)', async () => {
    const permit = makePermit('VP-SCHOLD', {
      permitType: 'scheduled',
      status: 'active',
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      endDate: new Date('2020-12-31T00:00:00.000Z'),
    });
    const vehicle = makeVehicle('V-SCH', { visitorPermitId: 'perm-sch' });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-SCH' },
      vehicles: { 'V-SCH': vehicle },
      permits: { byUuid: { 'perm-sch': permit } },
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'RED',
      reason: 'OUT_OF_DATE_RANGE',
      subject: veh(
        'visitor',
        zaidScheduled('2020-01-01T00:00:00.000Z', '2020-12-31T00:00:00.000Z'),
      ),
    });
  });

  it('admits a scheduled owner-permit vehicle within its window (GREEN + data)', async () => {
    const permit = makePermit('VP-SCHOK', {
      permitType: 'scheduled',
      status: 'active',
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      endDate: new Date('2999-12-31T00:00:00.000Z'),
    });
    const vehicle = makeVehicle('V-SCHOK', { visitorPermitId: 'perm-schok' });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-SCHOK' },
      vehicles: { 'V-SCHOK': vehicle },
      permits: { byUuid: { 'perm-schok': permit } },
    });

    await expect(uc.execute('vtok', 'guard-1')).resolves.toEqual({
      result: 'GREEN',
      subjectName: 'Visitor vehicle: Zaid',
      department: 'IT',
      subject: veh(
        'visitor',
        zaidScheduled('2020-01-01T00:00:00.000Z', '2999-12-31T00:00:00.000Z'),
      ),
    });
  });

  // ── No-leak guards (sensitive fields must NEVER reach the subject block) ─────
  it('employee subject exposes only the safe keys (no self id / sensitive field)', async () => {
    const { uc } = make({
      tokens: { tok: 'E-1001' },
      employees: { 'E-1001': active },
    });
    const res = await uc.execute('tok', 'guard-1');
    const subj = res.subject;
    expect(subj && Object.keys(subj).sort()).toEqual(
      [
        'branch',
        'commandDepartment',
        'currentJobTitle',
        'fullName',
        'kind',
        'personnelType',
        'priority',
        'rank',
        'serviceStatus',
        'serviceExitDate',
        'serviceExitNote',
      ].sort(),
    );
    expect(subj).not.toHaveProperty('employeeId');
    expect(subj).not.toHaveProperty('selfId');
  });

  it('visitor subject never leaks idOrPhone or the permit token', async () => {
    const permit = makePermit('VP-PII', {
      permitType: 'single_entry',
      status: 'used',
      idOrPhone: 'NATIONAL-ID-9999',
      token: 'v1.permit:secret.sig',
    });
    const { uc } = make({
      tokens: { ptok: 'permit:VP-PII' },
      permits: { byNumber: { 'VP-PII': permit } },
    });
    const res = await uc.execute('ptok', 'guard-1'); // RED ALREADY_USED, subject present
    const subj = res.subject;
    expect(subj).not.toHaveProperty('idOrPhone');
    expect(subj).not.toHaveProperty('token');
    expect(JSON.stringify(subj)).not.toContain('NATIONAL-ID-9999');
    expect(JSON.stringify(subj)).not.toContain('v1.permit:secret.sig');
  });

  it('vehicle subject never leaks the barcode token', async () => {
    const vehicle = makeVehicle('V-PII', {
      employeeId: 'emp-uuid-1',
      barcodeToken: 'v1.vehicle:secret.sig',
    });
    const { uc } = make({
      tokens: { vtok: 'vehicle:V-PII' },
      vehicles: { 'V-PII': vehicle },
      employeesById: { 'emp-uuid-1': active },
    });
    const res = await uc.execute('vtok', 'guard-1'); // GREEN, vehicle subject
    const subj = res.subject;
    expect(subj).not.toHaveProperty('barcodeToken');
    expect(JSON.stringify(subj)).not.toContain('v1.vehicle:secret.sig');
  });

  // ── Service exit (separate from the ban) ────────────────────────────────────
  it('rejects an out-of-service employee with the service reason + data', async () => {
    const discharged = new Employee(
      'E-D',
      'Dana',
      'Ops',
      'military',
      'active',
      false,
      null,
      null,
      null,
      null,
      'discharged',
      new Date('2026-01-05T00:00:00.000Z'),
      null,
    );
    const { uc } = make({
      tokens: { tok: 'E-D' },
      employees: { 'E-D': discharged },
    });
    const res = await uc.execute('tok', 'guard-1');
    expect(res).toEqual({
      result: 'RED',
      reason: 'DISCHARGED',
      subject: {
        kind: 'employee',
        fullName: 'Dana',
        commandDepartment: 'Ops',
        branch: null,
        priority: null,
        personnelType: 'military',
        rank: null,
        currentJobTitle: null,
        serviceStatus: 'discharged',
        serviceExitDate: '2026-01-05T00:00:00.000Z',
        serviceExitNote: null,
      },
    });
  });

  it('prefers BANNED over the service reason for a banned, out-of-service employee', async () => {
    const banDischarged = new Employee(
      'E-BD',
      'X',
      'Ops',
      'military',
      'active',
      true, // banned (DB flag)
      null,
      null,
      null,
      null,
      'discharged',
      new Date('2020-01-01T00:00:00.000Z'),
      null,
    );
    const { uc } = make({
      tokens: { tok: 'E-BD' },
      employees: { 'E-BD': banDischarged },
    });
    const res = await uc.execute('tok', 'guard-1');
    expect(res.result).toBe('RED');
    // Narrow to the RED branch before reading reason (GREEN carries no reason).
    if (res.result === 'RED') {
      expect(res.reason).toBe('BANNED'); // ban priority over service status
      // The subject still surfaces the service status for the guard.
      expect(res.subject).toMatchObject({ serviceStatus: 'discharged' });
    }
  });

  // ── Gate authorization (phase 4-b) ──────────────────────────────────────────
  // Exercises the per-gate authorization layer that sits ON TOP of canEnter. It is
  // reached only when the flag is ON and the guard has a pinned station; an employee
  // with no grants stays unrestricted (the optional-restriction policy).
  describe('gate authorization (phase 4-b)', () => {
    // Flag OFF → the gate check is skipped entirely, even with grants for another gate.
    it('gate auth OFF: grants ignored at any station (GREEN)', async () => {
      const { uc } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        grants: { 'E-1001': ['gate-other'] },
        enforced: false,
      });
      await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
        result: 'GREEN',
        subjectName: 'Sara',
        department: 'IT',
        subject: activeInfo,
      });
    });

    // Flag ON but no station pinned → skip (phase-4a: never block without a station).
    it('gate auth ON, no pinned station: passes (GREEN)', async () => {
      const { uc } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        grants: { 'E-1001': ['gate-other'] },
        enforced: true, // boundGateId defaults to null
      });
      await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
        result: 'GREEN',
        subjectName: 'Sara',
        department: 'IT',
        subject: activeInfo,
      });
    });

    // Optional-restriction policy: an employee with NO grants is unrestricted.
    it('gate auth ON, employee with NO grants is unrestricted (GREEN)', async () => {
      const { uc } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        enforced: true, // grants default to {}
      });
      await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
        result: 'GREEN',
        subjectName: 'Sara',
        department: 'IT',
        subject: activeInfo,
      });
    });

    // Restricted employee at a station NOT in their grants → denied.
    it('gate auth ON, granted employee at a NON-granted station (RED GATE_NOT_AUTHORIZED)', async () => {
      const { uc, audit } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        grants: { 'E-1001': ['gate-other'] },
        enforced: true,
      });
      const res = await uc.execute('tok', 'guard-1');
      expect(res).toEqual({
        result: 'RED',
        reason: 'GATE_NOT_AUTHORIZED',
        subject: activeInfo,
      });
      expect(audit.entries[0]).toMatchObject({
        type: 'entry_check_denied',
        result: 'failure',
        reason: 'GATE_NOT_AUTHORIZED',
      });
    });

    // Restricted employee AT their granted station → allowed.
    it('gate auth ON, granted employee at their OWN station (GREEN)', async () => {
      const { uc } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        grants: { 'E-1001': ['gate-x'] },
        enforced: true,
      });
      await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
        result: 'GREEN',
        subjectName: 'Sara',
        department: 'IT',
        subject: activeInfo,
      });
    });
  });

  // ── Gate authorization — strict mode (default-deny) ─────────────────────────
  // Strict removes the optional escape hatch: when enforcement is on and a station
  // is pinned, an employee with NO grants is denied outright (default-deny), instead
  // of passing on canEnter alone.
  describe('gate authorization — strict mode (default-deny)', () => {
    // Strict ON + employee has NO grants → denied outright (the escape hatch is removed).
    it('strict ON, employee with NO grants is DENIED (RED GATE_NOT_AUTHORIZED)', async () => {
      const { uc, audit } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        enforced: true,
        strict: true, // grants default to {}
      });
      const res = await uc.execute('tok', 'guard-1');
      expect(res).toEqual({
        result: 'RED',
        reason: 'GATE_NOT_AUTHORIZED',
        subject: activeInfo,
      });
      expect(audit.entries[0]).toMatchObject({
        type: 'entry_check_denied',
        result: 'failure',
        reason: 'GATE_NOT_AUTHORIZED',
      });
    });

    // Strict ON + granted for THIS station → allowed.
    it('strict ON, granted employee at their OWN station (GREEN)', async () => {
      const { uc } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        grants: { 'E-1001': ['gate-x'] },
        enforced: true,
        strict: true,
      });
      await expect(uc.execute('tok', 'guard-1')).resolves.toEqual({
        result: 'GREEN',
        subjectName: 'Sara',
        department: 'IT',
        subject: activeInfo,
      });
    });

    // Strict ON + granted for ANOTHER station → denied (reached via the second check).
    it('strict ON, granted employee at a NON-granted station (RED GATE_NOT_AUTHORIZED)', async () => {
      const { uc, audit } = make({
        tokens: { tok: 'E-1001' },
        employees: { 'E-1001': active },
        boundGateId: 'gate-x',
        grants: { 'E-1001': ['gate-other'] },
        enforced: true,
        strict: true,
      });
      const res = await uc.execute('tok', 'guard-1');
      expect(res).toEqual({
        result: 'RED',
        reason: 'GATE_NOT_AUTHORIZED',
        subject: activeInfo,
      });
      expect(audit.entries[0]).toMatchObject({
        type: 'entry_check_denied',
        result: 'failure',
        reason: 'GATE_NOT_AUTHORIZED',
      });
    });
  });
});
