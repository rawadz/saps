import { UnauthorizedException } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { PasswordService } from '../services/password.service';
import { SessionService } from '../services/session.service';
import { RefreshPayload, TokenService } from '../services/token.service';
import { AdminLoginUseCase } from './admin-login.use-case';

class FakeUsers implements UserRepository {
  constructor(private readonly byUsername: Record<string, User>) {}
  findByUsername(username: string): Promise<User | null> {
    return Promise.resolve(this.byUsername[username] ?? null);
  }
  findById(id: string): Promise<User | null> {
    const found = Object.values(this.byUsername).find((u) => u.id === id);
    return Promise.resolve(found ?? null);
  }
  updatePassword(): Promise<void> {
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

class FakeTokens implements TokenService {
  signEmployeeAccess(): Promise<string> {
    return Promise.resolve('emp');
  }
  signAdminAccess(userId: string, role: string): Promise<string> {
    return Promise.resolve(`access:${userId}:${role}`);
  }
  signRefresh(userId: string, deviceId: string): Promise<string> {
    return Promise.resolve(`refresh:${userId}:${deviceId}`);
  }
  verifyRefresh(): Promise<RefreshPayload | null> {
    return Promise.resolve(null);
  }
}

class FakeSessions implements SessionService {
  public replaced: { userId: string; deviceId: string; token: string }[] = [];
  replaceActiveSession(
    userId: string,
    deviceId: string,
    token: string,
  ): Promise<void> {
    this.replaced.push({ userId, deviceId, token });
    return Promise.resolve();
  }
  isCurrentDevice(): Promise<boolean> {
    return Promise.resolve(true);
  }
  clear(): Promise<void> {
    return Promise.resolve();
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  return new User(
    overrides.id ?? 'u1',
    overrides.username ?? 'branch.head',
    overrides.role ?? 'branch_head',
    overrides.passwordHash ?? 'stored-hash',
    overrides.isAccountActivated ?? true,
    overrides.mustChangePassword ?? false,
  );
}

describe('AdminLoginUseCase', () => {
  const PASSWORD = 'Str0ng-Passw0rd!';

  function make(users: Record<string, User>) {
    const sessions = new FakeSessions();
    const uc = new AdminLoginUseCase(
      new FakeUsers(users),
      new FakePasswords(PASSWORD),
      new FakeTokens(),
      sessions,
    );
    return { uc, sessions };
  }

  it('rejects missing fields', async () => {
    const { uc } = make({});
    await expect(uc.execute('', '', '')).rejects.toThrow('LOGIN_FAILED');
  });

  it('rejects a wrong password', async () => {
    const { uc } = make({ 'branch.head': makeUser() });
    await expect(
      uc.execute('branch.head', 'wrong-password', 'device-1'),
    ).rejects.toThrow('LOGIN_FAILED');
  });

  it('rejects an unknown user (still generic, runs dummy verify)', async () => {
    const { uc } = make({});
    await expect(
      uc.execute('ghost', PASSWORD, 'device-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a not-yet-activated account', async () => {
    const { uc } = make({
      'branch.head': makeUser({ isAccountActivated: false }),
    });
    await expect(
      uc.execute('branch.head', PASSWORD, 'device-1'),
    ).rejects.toThrow('ACCOUNT_NOT_ACTIVATED');
  });

  it('issues tokens, replaces the session (single-device), and surfaces mustChangePassword', async () => {
    const { uc, sessions } = make({
      'branch.head': makeUser({ mustChangePassword: true }),
    });

    const result = await uc.execute('branch.head', PASSWORD, 'device-1');

    expect(result.accessToken).toBe('access:u1:branch_head');
    expect(result.refreshToken).toBe('refresh:u1:device-1');
    expect(result.mustChangePassword).toBe(true);
    // Single-device rule: the active session was (re)written for this device.
    expect(sessions.replaced).toHaveLength(1);
    expect(sessions.replaced[0]).toMatchObject({
      userId: 'u1',
      deviceId: 'device-1',
    });
  });
});
