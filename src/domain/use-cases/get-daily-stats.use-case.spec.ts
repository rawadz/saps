import { ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/role';
import {
  AuditQueryRepository,
  DailyStats,
  GateLogPage,
} from '../repositories/audit-query.repository';
import { GetDailyStatsUseCase } from './get-daily-stats.use-case';

interface FakeScan {
  type: string; // entry_check_approved | entry_check_denied | entry_block | ...
  result: 'success' | 'failure';
  subjectType: 'employee' | 'permit' | 'vehicle' | null;
  createdAt: Date;
}

/**
 * Fake that models the dailyStats CONTRACT in memory: count only gate scans
 * (entry_check_*) on/after dayStart, bucketed exactly as the SQL should. This lets
 * the tests assert the aggregate numbers against a known dataset.
 */
class FakeAuditQuery implements AuditQueryRepository {
  public lastDayStart?: Date;
  constructor(private readonly scans: FakeScan[] = []) {}

  queryGateLog(): Promise<GateLogPage> {
    return Promise.resolve({ items: [], page: 1, pageSize: 20, total: 0 });
  }

  dailyStats(dayStart: Date): Promise<DailyStats> {
    this.lastDayStart = dayStart;
    const todays = this.scans.filter(
      (s) =>
        (s.type === 'entry_check_approved' ||
          s.type === 'entry_check_denied') &&
        s.createdAt >= dayStart,
    );
    const approved = todays.filter((s) => s.result === 'success');
    return Promise.resolve({
      totalScans: todays.length,
      approved: approved.length,
      denied: todays.filter((s) => s.result === 'failure').length,
      visitorEntries: approved.filter((s) => s.subjectType === 'permit').length,
      vehicleEntries: approved.filter((s) => s.subjectType === 'vehicle').length,
    });
  }
}

function newUseCase(repo = new FakeAuditQuery()): {
  uc: GetDailyStatsUseCase;
  repo: FakeAuditQuery;
} {
  return { uc: new GetDailyStatsUseCase(repo), repo };
}

describe('GetDailyStatsUseCase', () => {
  // ── Authorization (defense in depth alongside the RolesGuard) ───────────────
  it.each(['guard', 'permit_officer', 'employee'] as Role[])(
    'forbids role %s',
    async (role) => {
      const { uc, repo } = newUseCase();
      await expect(uc.execute({ actingRole: role })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.lastDayStart).toBeUndefined(); // never reaches the repository
    },
  );

  it.each(['super_admin', 'branch_head', 'supervisor', 'hr'] as Role[])(
    'allows role %s',
    async (role) => {
      const { uc, repo } = newUseCase();
      await uc.execute({ actingRole: role });
      expect(repo.lastDayStart).toBeDefined();
    },
  );

  // ── Day window ──────────────────────────────────────────────────────────────
  it('asks the repository for the start of the current local day', async () => {
    const { uc, repo } = newUseCase();
    await uc.execute({ actingRole: 'supervisor' });
    const dayStart = repo.lastDayStart!;
    expect(dayStart.getHours()).toBe(0);
    expect(dayStart.getMinutes()).toBe(0);
    expect(dayStart.getSeconds()).toBe(0);
    expect(dayStart.getMilliseconds()).toBe(0);
    expect(dayStart.getTime()).toBeLessThanOrEqual(Date.now());
  });

  // ── Aggregate correctness ───────────────────────────────────────────────────
  it('aggregates the current day scans into the five counters correctly', async () => {
    const now = new Date();
    const beforeToday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const scans: FakeScan[] = [
      { type: 'entry_check_approved', result: 'success', subjectType: 'employee', createdAt: now },
      { type: 'entry_check_approved', result: 'success', subjectType: 'permit', createdAt: now },
      { type: 'entry_check_approved', result: 'success', subjectType: 'permit', createdAt: now },
      { type: 'entry_check_approved', result: 'success', subjectType: 'vehicle', createdAt: now },
      { type: 'entry_check_denied', result: 'failure', subjectType: 'employee', createdAt: now },
      { type: 'entry_check_denied', result: 'failure', subjectType: 'vehicle', createdAt: now },
      // Excluded: an administrative ban event (not a gate scan).
      { type: 'entry_block', result: 'success', subjectType: 'employee', createdAt: now },
      // Excluded: a scan from before today.
      { type: 'entry_check_approved', result: 'success', subjectType: 'permit', createdAt: beforeToday },
    ];
    const { uc } = newUseCase(new FakeAuditQuery(scans));

    const stats = await uc.execute({ actingRole: 'super_admin' });

    expect(stats).toEqual({
      totalScans: 6, // 4 approved + 2 denied today (ban + before-today excluded)
      approved: 4,
      denied: 2,
      visitorEntries: 2, // approved permit scans today
      vehicleEntries: 1, // approved vehicle scans today
    });
    // Sanity: the approved/denied split adds up to the total.
    expect(stats.approved + stats.denied).toBe(stats.totalScans);
  });

  it('returns all-zero counters when there are no scans today', async () => {
    const { uc } = newUseCase(new FakeAuditQuery([]));
    const stats = await uc.execute({ actingRole: 'branch_head' });
    expect(stats).toEqual({
      totalScans: 0,
      approved: 0,
      denied: 0,
      visitorEntries: 0,
      vehicleEntries: 0,
    });
  });
});
