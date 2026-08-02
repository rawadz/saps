import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { PasswordService } from '../services/password.service';
import { ChangePasswordUseCase } from './change-password.use-case';

class FakeUsers implements UserRepository {
  public updated: { id: string; hash: string }[] = [];
  constructor(private readonly byId: Record<string, User>) {}
  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }
  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId[id] ?? null);
  }
  updatePassword(id: string, newPasswordHash: string): Promise<void> {
    this.updated.push({ id, hash: newPasswordHash });
    return Promise.resolve();
  }
  setActivated(): Promise<void> {
    return Promise.resolve();
  }
  create(): Promise<{ id: string }> {
    return Promise.resolve({ id: 'user-id' });
  }
  countActiveByRole(): Promise<number> {
    return Promise.resolve(0);
  }
}

class FakePasswords implements PasswordService {
  constructor(private readonly correct: string) {}
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hash:${plain}`);
  }
  verify(_hash: string, plain: string): Promise<boolean> {
    return Promise.resolve(plain === this.correct);
  }
  dummyHash(): string {
    return 'dummy';
  }
}

const CURRENT = 'OldStr0ng-Pass!';
const user = new User('u1', 'branch.head', 'branch_head', 'hash', true, true);

describe('ChangePasswordUseCase', () => {
  function make() {
    const users = new FakeUsers({ u1: user });
    const uc = new ChangePasswordUseCase(users, new FakePasswords(CURRENT));
    return { uc, users };
  }

  it('rejects a wrong current password', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        userId: 'u1',
        currentPassword: 'nope',
        newPassword: 'NewStr0ng-Pass!',
      }),
    ).rejects.toThrow('INVALID_CURRENT_PASSWORD');
  });

  it('rejects a new password that violates the policy', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        userId: 'u1',
        currentPassword: CURRENT,
        newPassword: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reusing the current password', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        userId: 'u1',
        currentPassword: CURRENT,
        newPassword: CURRENT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the user does not exist', async () => {
    const uc = new ChangePasswordUseCase(
      new FakeUsers({}),
      new FakePasswords(CURRENT),
    );
    await expect(
      uc.execute({
        userId: 'ghost',
        currentPassword: CURRENT,
        newPassword: 'NewStr0ng-Pass!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stores the new Argon2id hash for a valid change', async () => {
    const { uc, users } = make();
    await uc.execute({
      userId: 'u1',
      currentPassword: CURRENT,
      newPassword: 'NewStr0ng-Pass!',
    });
    expect(users.updated).toEqual([{ id: 'u1', hash: 'hash:NewStr0ng-Pass!' }]);
  });
});
