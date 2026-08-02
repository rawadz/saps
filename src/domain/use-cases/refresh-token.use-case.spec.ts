import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { SessionService } from '../services/session.service';
import { RefreshPayload, TokenService } from '../services/token.service';
import { RefreshTokenUseCase } from './refresh-token.use-case';

class FakeUsers implements UserRepository {
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

class FakeTokens implements TokenService {
  constructor(private readonly payload: RefreshPayload | null) {}
  signEmployeeAccess(): Promise<string> {
    return Promise.resolve('emp');
  }
  signAdminAccess(userId: string, role: string): Promise<string> {
    return Promise.resolve(`access:${userId}:${role}`);
  }
  signRefresh(): Promise<string> {
    return Promise.resolve('refresh');
  }
  verifyRefresh(): Promise<RefreshPayload | null> {
    return Promise.resolve(this.payload);
  }
}

class FakeSessions implements SessionService {
  constructor(private readonly current: boolean) {}
  replaceActiveSession(): Promise<void> {
    return Promise.resolve();
  }
  isCurrentDevice(): Promise<boolean> {
    return Promise.resolve(this.current);
  }
  clear(): Promise<void> {
    return Promise.resolve();
  }
}

const user = new User('u1', 'guard.one', 'guard', 'hash', true, false);

describe('RefreshTokenUseCase', () => {
  it('rejects an unverifiable refresh token', async () => {
    const uc = new RefreshTokenUseCase(
      new FakeTokens(null),
      new FakeSessions(true),
      new FakeUsers({ u1: user }),
    );
    await expect(uc.execute('bad')).rejects.toThrow('INVALID_REFRESH_TOKEN');
  });

  it('rejects a displaced device (single-device rule)', async () => {
    const uc = new RefreshTokenUseCase(
      new FakeTokens({ sub: 'u1', deviceId: 'd1' }),
      new FakeSessions(false), // not the current device
      new FakeUsers({ u1: user }),
    );
    await expect(uc.execute('stale')).rejects.toThrow('SESSION_DISPLACED');
  });

  it('rejects when the user no longer exists or is deactivated', async () => {
    const uc = new RefreshTokenUseCase(
      new FakeTokens({ sub: 'gone', deviceId: 'd1' }),
      new FakeSessions(true),
      new FakeUsers({ u1: user }),
    );
    await expect(uc.execute('ok')).rejects.toThrow('LOGIN_FAILED');
  });

  it('issues a fresh access token for the current device', async () => {
    const uc = new RefreshTokenUseCase(
      new FakeTokens({ sub: 'u1', deviceId: 'd1' }),
      new FakeSessions(true),
      new FakeUsers({ u1: user }),
    );
    await expect(uc.execute('good')).resolves.toEqual({
      accessToken: 'access:u1:guard',
    });
  });
});
