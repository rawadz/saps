import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../auth/role';
import { User } from '../entities/user.entity';
import {
  CreateUserData,
  UserRepository,
} from '../repositories/user.repository';
import { DeactivateUserAccountUseCase } from './deactivate-user-account.use-case';

class FakeUsers implements UserRepository {
  public changes: { id: string; value: boolean }[] = [];
  constructor(
    private readonly byId: Record<string, User> = {},
    private readonly activeSupers = 0,
  ) {}
  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
  create(_data: CreateUserData): Promise<{ id: string }> {
    return Promise.resolve({ id: 'x' });
  }
  updatePassword(): Promise<void> {
    return Promise.resolve();
  }
  setActivated(id: string, value: boolean): Promise<void> {
    this.changes.push({ id, value });
    return Promise.resolve();
  }
  countActiveByRole(): Promise<number> {
    return Promise.resolve(this.activeSupers);
  }
}

function userWithRole(id: string, role: UserRole, active = true): User {
  return new User(id, `${role}.user`, role, 'hash', active, false);
}

function make(byId: Record<string, User> = {}, activeSupers = 0) {
  const users = new FakeUsers(byId, activeSupers);
  const uc = new DeactivateUserAccountUseCase(users);
  return { uc, users };
}

describe('DeactivateUserAccountUseCase', () => {
  it('deactivates a lower-role user (super admin acting)', async () => {
    const { uc, users } = make({ t1: userWithRole('t1', 'supervisor') });
    await uc.execute({
      actingRole: 'super_admin',
      actingUserId: 'me',
      targetUserId: 't1',
    });
    expect(users.changes).toEqual([{ id: 't1', value: false }]);
  });

  it('forbids deactivating yourself', async () => {
    const { uc, users } = make({ me: userWithRole('me', 'super_admin') }, 5);
    await expect(
      uc.execute({ actingRole: 'super_admin', actingUserId: 'me', targetUserId: 'me' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.changes).toHaveLength(0);
  });

  it('throws not found for a missing target', async () => {
    const { uc } = make();
    await expect(
      uc.execute({ actingRole: 'super_admin', actingUserId: 'me', targetUserId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids the last active super admin from being deactivated', async () => {
    const { uc, users } = make({ s1: userWithRole('s1', 'super_admin') }, 1);
    await expect(
      uc.execute({ actingRole: 'super_admin', actingUserId: 'me', targetUserId: 's1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.changes).toHaveLength(0);
  });

  it('allows deactivating a super admin when others remain active', async () => {
    const { uc, users } = make({ s1: userWithRole('s1', 'super_admin') }, 2);
    await uc.execute({
      actingRole: 'super_admin',
      actingUserId: 'me',
      targetUserId: 's1',
    });
    expect(users.changes).toEqual([{ id: 's1', value: false }]);
  });

  it('forbids a branch head from deactivating a super admin', async () => {
    const { uc, users } = make({ s1: userWithRole('s1', 'super_admin') }, 3);
    await expect(
      uc.execute({ actingRole: 'branch_head', actingUserId: 'me', targetUserId: 's1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.changes).toHaveLength(0);
  });

  it('forbids a branch head from deactivating another branch head', async () => {
    const { uc } = make({ b2: userWithRole('b2', 'branch_head') });
    await expect(
      uc.execute({ actingRole: 'branch_head', actingUserId: 'me', targetUserId: 'b2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a branch head deactivate a supervisor', async () => {
    const { uc, users } = make({ sup: userWithRole('sup', 'supervisor') });
    await uc.execute({
      actingRole: 'branch_head',
      actingUserId: 'me',
      targetUserId: 'sup',
    });
    expect(users.changes).toEqual([{ id: 'sup', value: false }]);
  });
});
