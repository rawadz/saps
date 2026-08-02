import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/role';
import {
  AuditQueryRepository,
  DailyStats,
  GateLogFilter,
  GateLogPage,
} from '../repositories/audit-query.repository';
import { GetGateLogUseCase } from './get-gate-log.use-case';

function emptyPage(): GateLogPage {
  return { items: [], page: 1, pageSize: 20, total: 0 };
}

class FakeAuditQuery implements AuditQueryRepository {
  public lastFilter?: GateLogFilter;
  constructor(private readonly page: GateLogPage = emptyPage()) {}
  queryGateLog(filter: GateLogFilter): Promise<GateLogPage> {
    this.lastFilter = filter;
    // Echo back the filter's paging so the use-case's normalization is observable.
    return Promise.resolve({
      ...this.page,
      page: filter.page,
      pageSize: filter.pageSize,
    });
  }
  dailyStats(): Promise<DailyStats> {
    // Not exercised by the gate-log use-case; stubbed to satisfy the interface.
    return Promise.resolve({
      totalScans: 0,
      approved: 0,
      denied: 0,
      visitorEntries: 0,
      vehicleEntries: 0,
    });
  }
}

function newUseCase(repo = new FakeAuditQuery()): {
  uc: GetGateLogUseCase;
  repo: FakeAuditQuery;
} {
  return { uc: new GetGateLogUseCase(repo), repo };
}

describe('GetGateLogUseCase', () => {
  // ── Authorization (defense in depth alongside the RolesGuard) ───────────────
  it.each(['guard', 'permit_officer', 'employee'] as Role[])(
    'forbids role %s',
    async (role) => {
      const { uc, repo } = newUseCase();
      await expect(uc.execute({ actingRole: role })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.lastFilter).toBeUndefined(); // never reaches the repository
    },
  );

  it.each(['super_admin', 'branch_head', 'supervisor', 'hr'] as Role[])(
    'allows role %s',
    async (role) => {
      const { uc, repo } = newUseCase();
      await uc.execute({ actingRole: role });
      expect(repo.lastFilter).toBeDefined();
    },
  );

  // ── Pagination bounds ───────────────────────────────────────────────────────
  it('defaults to page 1 and the default page size when unspecified', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({ actingRole: 'supervisor' });
    expect(repo.lastFilter).toMatchObject({
      page: 1,
      pageSize: GetGateLogUseCase.DEFAULT_PAGE_SIZE,
    });
  });

  it('clamps an oversized page size to the maximum', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({ actingRole: 'supervisor', pageSize: 9999 });
    expect(repo.lastFilter?.pageSize).toBe(GetGateLogUseCase.MAX_PAGE_SIZE);
  });

  it('raises a sub-1 page size to 1', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({ actingRole: 'supervisor', pageSize: 0 });
    expect(repo.lastFilter?.pageSize).toBe(1);
  });

  it('normalizes a page below 1 to 1', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({ actingRole: 'supervisor', page: -5 });
    expect(repo.lastFilter?.page).toBe(1);
  });

  // ── Date filters ────────────────────────────────────────────────────────────
  it('parses ISO from/to dates and passes them through', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({
      actingRole: 'supervisor',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-20T00:00:00.000Z',
    });
    expect(repo.lastFilter?.from).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(repo.lastFilter?.to).toEqual(new Date('2026-06-20T00:00:00.000Z'));
  });

  it('rejects an invalid from date', async () => {
    const { uc } = newUseCase();
    await expect(
      uc.execute({ actingRole: 'supervisor', from: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a from date later than the to date', async () => {
    const { uc } = newUseCase();
    await expect(
      uc.execute({
        actingRole: 'supervisor',
        from: '2026-06-20T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Gate / result filters ───────────────────────────────────────────────────
  it('passes the gate and result filters through, trimming the gate', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({
      actingRole: 'branch_head',
      gateName: '  GATE-A  ',
      result: 'RED',
    });
    expect(repo.lastFilter).toMatchObject({ gateName: 'GATE-A', result: 'RED' });
  });

  it('treats a blank gate name as no filter', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({ actingRole: 'supervisor', gateName: '   ' });
    expect(repo.lastFilter?.gateName).toBeUndefined();
  });

  // ── Pass-through of the repository page ──────────────────────────────────────
  it('returns the repository page (names only, no sensitive ids)', async () => {
    const page: GateLogPage = {
      items: [
        {
          id: 'a1',
          occurredAt: new Date('2026-06-20T10:00:00.000Z'),
          gateName: 'GATE-A',
          result: 'GREEN',
          reason: null,
          subjectType: 'employee',
          subjectName: 'Sara',
          subjectOwnerName: null,
          guardName: 'Guard One',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    const { uc } = newUseCase(new FakeAuditQuery(page));
    const res = await uc.execute({ actingRole: 'super_admin' });
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      subjectName: 'Sara',
      result: 'GREEN',
      guardName: 'Guard One',
    });
  });
});
