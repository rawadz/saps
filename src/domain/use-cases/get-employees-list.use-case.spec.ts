import { ForbiddenException } from '@nestjs/common';
import { employeeDisplayStatus } from '../entities/employee.entity';
import {
  EmployeeBarcodeExportRow,
  EmployeeListFilter,
  EmployeeListPage,
  EmployeeListRow,
  EmployeeQueryRepository,
} from '../repositories/employee-query.repository';
import { GetEmployeesListUseCase } from './get-employees-list.use-case';

class FakeEmployeeQuery implements EmployeeQueryRepository {
  public lastFilter?: EmployeeListFilter;
  public callCount = 0;
  constructor(
    private readonly rows: EmployeeListRow[] = [],
    private readonly total = 0,
  ) {}
  listEmployees(filter: EmployeeListFilter): Promise<EmployeeListPage> {
    this.lastFilter = filter;
    this.callCount += 1;
    return Promise.resolve({
      items: this.rows,
      page: filter.page,
      pageSize: filter.pageSize,
      total: this.total,
    });
  }
  listBarcodesForExport(): Promise<EmployeeBarcodeExportRow[]> {
    return Promise.resolve([]);
  }
}

function row(overrides: Partial<EmployeeListRow> = {}): EmployeeListRow {
  return {
    selfId: 'EMP-1',
    fullName: 'Test Name',
    personnelType: 'civilian',
    status: 'active',
    isEntryBlocked: false,
    commandDepartment: null,
    branch: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GetEmployeesListUseCase', () => {
  // ── Authorization ──────────────────────────────────────────────────────────
  it('forbids a role that cannot manage employees (guard)', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await expect(uc.execute({ actingRole: 'guard' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.callCount).toBe(0); // never reaches the repository
  });

  it('forbids permit_officer (may not list the directory)', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await expect(
      uc.execute({ actingRole: 'permit_officer' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.callCount).toBe(0);
  });

  it.each(['super_admin', 'branch_head', 'supervisor', 'hr'] as const)(
    'allows %s to list',
    async (role) => {
      const repo = new FakeEmployeeQuery([row()], 1);
      const uc = new GetEmployeesListUseCase(repo);
      const res = await uc.execute({ actingRole: role });
      expect(repo.callCount).toBe(1);
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
    },
  );

  // ── Pagination clamping ────────────────────────────────────────────────────
  it('defaults page=1 and pageSize=20 when omitted', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await uc.execute({ actingRole: 'hr' });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(GetEmployeesListUseCase.DEFAULT_PAGE_SIZE);
  });

  it('clamps pageSize to the hard maximum of 50', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await uc.execute({ actingRole: 'hr', pageSize: 999 });
    expect(repo.lastFilter?.pageSize).toBe(GetEmployeesListUseCase.MAX_PAGE_SIZE);
  });

  it('normalizes a zero/negative page to 1 and a sub-1 pageSize to 1', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await uc.execute({ actingRole: 'hr', page: 0, pageSize: 0 });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(1);
  });

  // ── Filters ────────────────────────────────────────────────────────────────
  it('passes the status filter through to the repository', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await uc.execute({ actingRole: 'hr', status: 'banned' });
    expect(repo.lastFilter?.status).toBe('banned');
  });

  it('trims the name query and drops a whitespace-only query', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await uc.execute({ actingRole: 'hr', nameQuery: '  Ali  ' });
    expect(repo.lastFilter?.nameQuery).toBe('Ali');

    const repo2 = new FakeEmployeeQuery();
    const uc2 = new GetEmployeesListUseCase(repo2);
    await uc2.execute({ actingRole: 'hr', nameQuery: '   ' });
    expect(repo2.lastFilter?.nameQuery).toBeUndefined();
  });

  it('passes an ID-shaped term through untouched (tokenization lives in the data layer)', async () => {
    const repo = new FakeEmployeeQuery();
    const uc = new GetEmployeesListUseCase(repo);
    await uc.execute({ actingRole: 'hr', nameQuery: '  EMP-20001  ' });
    expect(repo.lastFilter?.nameQuery).toBe('EMP-20001'); // trimmed, case preserved, not tokenized
  });

  // ── Display-status derivation (mapped output) ──────────────────────────────
  it('derives banned when blocked, overriding an active lifecycle status', async () => {
    const repo = new FakeEmployeeQuery(
      [row({ status: 'active', isEntryBlocked: true })],
      1,
    );
    const uc = new GetEmployeesListUseCase(repo);
    const res = await uc.execute({ actingRole: 'hr' });
    expect(res.items[0].displayStatus).toBe('banned');
    expect(res.items[0].status).toBe('active'); // raw status preserved alongside
  });

  it('derives active for an active, non-blocked employee', async () => {
    const repo = new FakeEmployeeQuery(
      [row({ status: 'active', isEntryBlocked: false })],
      1,
    );
    const uc = new GetEmployeesListUseCase(repo);
    const res = await uc.execute({ actingRole: 'hr' });
    expect(res.items[0].displayStatus).toBe('active');
  });

  it.each(['pending', 'suspended', 'terminated'] as const)(
    'derives inactive for a non-blocked %s employee',
    async (status) => {
      const repo = new FakeEmployeeQuery([row({ status, isEntryBlocked: false })], 1);
      const uc = new GetEmployeesListUseCase(repo);
      const res = await uc.execute({ actingRole: 'hr' });
      expect(res.items[0].displayStatus).toBe('inactive');
      expect(res.items[0].status).toBe(status);
    },
  );

  it('returns only the safe fields (no sensitive ids/hashes)', async () => {
    const repo = new FakeEmployeeQuery([row()], 1);
    const uc = new GetEmployeesListUseCase(repo);
    const res = await uc.execute({ actingRole: 'hr' });
    expect(Object.keys(res.items[0]).sort()).toEqual(
      [
        'branch',
        'commandDepartment',
        'createdAt',
        'displayStatus',
        'fullName',
        'personnelType',
        'selfId',
        'status',
      ].sort(),
    );
  });
});

describe('employeeDisplayStatus', () => {
  it('treats the ban flag as overriding any lifecycle status', () => {
    expect(employeeDisplayStatus('active', true)).toBe('banned');
    expect(employeeDisplayStatus('pending', true)).toBe('banned');
    expect(employeeDisplayStatus('terminated', true)).toBe('banned');
  });
  it('maps a non-blocked active employee to active', () => {
    expect(employeeDisplayStatus('active', false)).toBe('active');
  });
  it('maps every non-active, non-blocked lifecycle status to inactive', () => {
    expect(employeeDisplayStatus('pending', false)).toBe('inactive');
    expect(employeeDisplayStatus('suspended', false)).toBe('inactive');
    expect(employeeDisplayStatus('terminated', false)).toBe('inactive');
  });
});
