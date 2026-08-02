import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../auth/role';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { ActivateUserAccountUseCase } from './activate-user-account.use-case';

class FakeUsers implements UserRepository {
  public activated: { id: string; value: boolean }[] = [];
  constructor(private readonly byId: Record<string, User>) {}
  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
  updatePassword(): Promise<void> {
    return Promise.resolve();
  }
  setActivated(id: string, value: boolean): Promise<void> {
    this.activated.push({ id, value });
    return Promise.resolve();
  }
  create(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'user-id' });
  }
  countActiveByRole(): Promise<number> {
    return Promise.resolve(0);
  }
}

function userWithRole(id: string, role: UserRole): User {
  return new User(id, `${role}.user`, role, 'hash', false, false);
}

describe('ActivateUserAccountUseCase', () => {
  it('throws when the target user does not exist', async () => {
    const uc = new ActivateUserAccountUseCase(new FakeUsers({}));
    await expect(
      uc.execute({ actingRole: 'branch_head', targetUserId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a supervisor from activating a branch head', async () => {
    const users = new FakeUsers({ t1: userWithRole('t1', 'branch_head') });
    const uc = new ActivateUserAccountUseCase(users);
    await expect(
      uc.execute({ actingRole: 'supervisor', targetUserId: 't1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.activated).toHaveLength(0);
  });

  it('forbids a guard from activating anyone', async () => {
    const users = new FakeUsers({ t1: userWithRole('t1', 'guard') });
    const uc = new ActivateUserAccountUseCase(users);
    await expect(
      uc.execute({ actingRole: 'guard', targetUserId: 't1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a branch head activate a supervisor', async () => {
    const users = new FakeUsers({ t1: userWithRole('t1', 'supervisor') });
    const uc = new ActivateUserAccountUseCase(users);
    await uc.execute({ actingRole: 'branch_head', targetUserId: 't1' });
    expect(users.activated).toEqual([{ id: 't1', value: true }]);
  });
});
