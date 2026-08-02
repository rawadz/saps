import { ForbiddenException } from '@nestjs/common';
import {
  PermitListFilter,
  PermitListPage,
  PermitListRow,
  PermitQueryRepository,
} from '../repositories/permit-query.repository';
import { GetVisitorPermitsListUseCase } from './get-visitor-permits-list.use-case';

class FakePermitQuery implements PermitQueryRepository {
  public lastFilter?: PermitListFilter;
  public callCount = 0;
  constructor(
    private readonly rows: PermitListRow[] = [],
    private readonly total = 0,
  ) {}
  listPermits(filter: PermitListFilter): Promise<PermitListPage> {
    this.lastFilter = filter;
    this.callCount += 1;
    return Promise.resolve({
      items: this.rows,
      page: filter.page,
      pageSize: filter.pageSize,
      total: this.total,
    });
  }
}

function row(overrides: Partial<PermitListRow> = {}): PermitListRow {
  return {
    permitNumber: 'VP-1',
    visitorName: 'Visitor Name',
    permitType: 'single_entry',
    status: 'active',
    host: 'Some Department',
    personnelType: 'civilian',
    startDate: null,
    endDate: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GetVisitorPermitsListUseCase', () => {
  // ── Authorization ──────────────────────────────────────────────────────────
  it('forbids hr (may manage employees but not permits)', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await expect(uc.execute({ actingRole: 'hr' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(repo.callCount).toBe(0)
  });

  it('forbids a guard', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await expect(uc.execute({ actingRole: 'guard' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(repo.callCount).toBe(0)
  });

  it.each(['super_admin', 'permit_officer', 'branch_head', 'supervisor'] as const)(
    'allows %s to list',
    async (role) => {
      const repo = new FakePermitQuery([row()], 1);
      const uc = new GetVisitorPermitsListUseCase(repo);
      const res = await uc.execute({ actingRole: role });
      expect(repo.callCount).toBe(1);
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
    },
  );

  // ── Pagination clamping ────────────────────────────────────────────────────
  it('defaults page=1 and pageSize=20 when omitted', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer' });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(
      GetVisitorPermitsListUseCase.DEFAULT_PAGE_SIZE,
    );
  });

  it('clamps pageSize to the hard maximum of 50', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', pageSize: 999 });
    expect(repo.lastFilter?.pageSize).toBe(
      GetVisitorPermitsListUseCase.MAX_PAGE_SIZE,
    );
  });

  it('normalizes a zero/negative page to 1 and a sub-1 pageSize to 1', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', page: 0, pageSize: 0 });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(1);
  });

  // ── Filters ────────────────────────────────────────────────────────────────
  it('passes the status filter through to the repository', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', status: 'cancelled' });
    expect(repo.lastFilter?.status).toBe('cancelled');
  });

  it('passes the permitType filter through to the repository', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', permitType: 'scheduled' });
    expect(repo.lastFilter?.permitType).toBe('scheduled');
  });

  it('trims the name query and drops a whitespace-only query', async () => {
    const repo = new FakePermitQuery();
    const uc = new GetVisitorPermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', nameQuery: '  Sami  ' });
    expect(repo.lastFilter?.nameQuery).toBe('Sami');

    const repo2 = new FakePermitQuery();
    const uc2 = new GetVisitorPermitsListUseCase(repo2);
    await uc2.execute({ actingRole: 'permit_officer', nameQuery: '   ' });
    expect(repo2.lastFilter?.nameQuery).toBeUndefined();
  });

  // ── Safe shape ─────────────────────────────────────────────────────────────
  it('returns only the safe fields (no idOrPhone, no token)', async () => {
    const repo = new FakePermitQuery([row()], 1);
    const uc = new GetVisitorPermitsListUseCase(repo);
    const res = await uc.execute({ actingRole: 'permit_officer' });
    expect(Object.keys(res.items[0]).sort()).toEqual(
      [
        'createdAt',
        'endDate',
        'host',
        'permitNumber',
        'permitType',
        'personnelType',
        'startDate',
        'status',
        'visitorName',
      ].sort(),
    );
  });
});
