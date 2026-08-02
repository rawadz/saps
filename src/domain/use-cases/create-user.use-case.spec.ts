import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '../entities/user.entity';
import {
  CreateUserData,
  UserRepository,
} from '../repositories/user.repository';
import { PasswordService } from '../services/password.service';
import { CreateUserUseCase } from './create-user.use-case';

class FakeUsers implements UserRepository {
  public created: CreateUserData[] = [];
  constructor(private readonly byUsername: Record<string, User> = {}) {}
  findByUsername(username: string): Promise<User | null> {
    return Promise.resolve(this.byUsername[username] ?? null);
  }
  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }
  create(data: CreateUserData): Promise<{ id: string }> {
    this.created.push(data);
    return Promise.resolve({ id: 'user-test-id' });
  }
  countActiveByRole(): Promise<number> {
    return Promise.resolve(0);
  }
  updatePassword(): Promise<void> {
    return Promise.resolve();
  }
  setActivated(): Promise<void> {
    return Promise.resolve();
  }
}

class FakePasswords implements PasswordService {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`hash:${plain}`);
  }
  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }
  dummyHash(): string {
    return 'dummy';
  }
}

const STRONG = 'Str0ng-Passw0rd!';

describe('CreateUserUseCase', () => {
  function make(byUsername: Record<string, User> = {}) {
    const users = new FakeUsers(byUsername);
    const uc = new CreateUserUseCase(users, new FakePasswords());
    return { uc, users };
  }

  it('lets a branch head create a supervisor (inactive, must-change, hashed)', async () => {
    const { uc, users } = make();
    await uc.execute({
      actingRole: 'branch_head',
      username: 'sup.one',
      role: 'supervisor',
      password: STRONG,
    });
    expect(users.created).toHaveLength(1);
    expect(users.created[0]).toMatchObject({
      username: 'sup.one',
      role: 'supervisor',
      passwordHash: `hash:${STRONG}`,
    });
  });

  it('returns the created user id', async () => {
    const { uc } = make();
    const res = await uc.execute({
      actingRole: 'branch_head',
      username: 'sup.id',
      role: 'supervisor',
      password: STRONG,
    });
    expect(res.id).toBe('user-test-id');
  });

  it('lets a branch head create an HR head', async () => {
    const { uc, users } = make();
    await uc.execute({
      actingRole: 'branch_head',
      username: 'hrhead.one',
      role: 'hr_head',
      password: STRONG,
    });
    expect(users.created).toHaveLength(1);
    expect(users.created[0]).toMatchObject({
      username: 'hrhead.one',
      role: 'hr_head',
      passwordHash: `hash:${STRONG}`,
    });
  });

  it('forbids a branch head from creating another branch head', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'branch_head',
        username: 'bh2',
        role: 'branch_head',
        password: STRONG,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a branch head from creating a super admin', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'branch_head',
        username: 'sa2',
        role: 'super_admin',
        password: STRONG,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a branch head from creating a department manager', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'branch_head',
        username: 'dm2',
        role: 'department_manager',
        password: STRONG,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a guard from creating anyone', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'guard',
        username: 'x.user',
        role: 'guard',
        password: STRONG,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a weak initial password', async () => {
    const { uc } = make();
    await expect(
      uc.execute({
        actingRole: 'branch_head',
        username: 'sup.two',
        role: 'supervisor',
        password: 'weak',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate username', async () => {
    const existing = {
      'sup.one': new User('u1', 'sup.one', 'supervisor', 'h', true, false),
    };
    const { uc } = make(existing);
    await expect(
      uc.execute({
        actingRole: 'branch_head',
        username: 'sup.one',
        role: 'supervisor',
        password: STRONG,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
