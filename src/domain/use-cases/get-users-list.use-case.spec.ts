import { ForbiddenException } from '@nestjs/common';
import {
  UserListFilter,
  UserListPage,
  UserListRow,
  UserQueryRepository,
} from '../repositories/user-query.repository';
import { GetUsersListUseCase } from './get-users-list.use-case';

class FakeUserQuery implements UserQueryRepository {
  public lastFilter?: UserListFilter;
  public callCount = 0;
  constructor(
    private readonly rows: UserListRow[] = [],
    private readonly total = 0,
  ) {}
  listUsers(filter: UserListFilter): Promise<UserListPage> {
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

function row(overrides: Partial<UserListRow> = {}): UserListRow {
  return {
    id: 'u-1',
    username: 'sup.one',
    role: 'supervisor',
    fullName: null,
    isAccountActivated: false,
    mustChangePassword: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GetUsersListUseCase', () => {
  // ── Authorization: super_admin, department_manager, branch_head only ────────
  it.each(['supervisor', 'hr', 'permit_officer', 'guard'] as const)(
    'forbids %s (not authorized to list users)',
    async (role) => {
      const repo = new FakeUserQuery();
      const uc = new GetUsersListUseCase(repo);
      await expect(uc.execute({ actingRole: role })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.callCount).toBe(0); // never reaches the repository
    },
  );

  it('allows super_admin to list', async () => {
    const repo = new FakeUserQuery([row()], 1);
    const uc = new GetUsersListUseCase(repo);
    const res = await uc.execute({ actingRole: 'super_admin' });
    expect(repo.callCount).toBe(1);
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it('allows branch_head to list (user-management grant)', async () => {
    const repo = new FakeUserQuery([row()], 1);
    const uc = new GetUsersListUseCase(repo);
    const res = await uc.execute({ actingRole: 'branch_head' });
    expect(repo.callCount).toBe(1);
    expect(res.total).toBe(1);
  });

  // ── Pagination clamping ────────────────────────────────────────────────────
  it('defaults page=1 and pageSize=20 when omitted', async () => {
    const repo = new FakeUserQuery();
    const uc = new GetUsersListUseCase(repo);
    await uc.execute({ actingRole: 'super_admin' });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(GetUsersListUseCase.DEFAULT_PAGE_SIZE);
  });

  it('clamps pageSize to the hard maximum of 50', async () => {
    const repo = new FakeUserQuery();
    const uc = new GetUsersListUseCase(repo);
    await uc.execute({ actingRole: 'super_admin', pageSize: 999 });
    expect(repo.lastFilter?.pageSize).toBe(GetUsersListUseCase.MAX_PAGE_SIZE);
  });

  it('normalizes a zero/negative page to 1 and a sub-1 pageSize to 1', async () => {
    const repo = new FakeUserQuery();
    const uc = new GetUsersListUseCase(repo);
    await uc.execute({ actingRole: 'super_admin', page: 0, pageSize: 0 });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(1);
  });

  // ── Filters ────────────────────────────────────────────────────────────────
  it('passes the role filter through to the repository', async () => {
    const repo = new FakeUserQuery();
    const uc = new GetUsersListUseCase(repo);
    await uc.execute({ actingRole: 'super_admin', role: 'guard' });
    expect(repo.lastFilter?.role).toBe('guard');
  });

  it('trims the username query and drops a whitespace-only query', async () => {
    const repo = new FakeUserQuery();
    const uc = new GetUsersListUseCase(repo);
    await uc.execute({ actingRole: 'super_admin', usernameQuery: '  bran  ' });
    expect(repo.lastFilter?.usernameQuery).toBe('bran');

    const repo2 = new FakeUserQuery();
    const uc2 = new GetUsersListUseCase(repo2);
    await uc2.execute({ actingRole: 'super_admin', usernameQuery: '   ' });
    expect(repo2.lastFilter?.usernameQuery).toBeUndefined();
  });

  // ── Safe shape ─────────────────────────────────────────────────────────────
  it('returns only the safe fields (never a password hash)', async () => {
    const repo = new FakeUserQuery([row()], 1);
    const uc = new GetUsersListUseCase(repo);
    const res = await uc.execute({ actingRole: 'super_admin' });
    expect(Object.keys(res.items[0]).sort()).toEqual(
      [
        'createdAt',
        'fullName',
        'id',
        'isAccountActivated',
        'mustChangePassword',
        'role',
        'username',
      ].sort(),
    );
  });
});
