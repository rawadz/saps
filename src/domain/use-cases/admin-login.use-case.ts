import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  UserRepository,
  USER_REPOSITORY,
} from '../repositories/user.repository';
import {
  PasswordService,
  PASSWORD_SERVICE,
} from '../services/password.service';
import { TokenService, TOKEN_SERVICE } from '../services/token.service';
import { SessionService, SESSION_SERVICE } from '../services/session.service';

export interface AdminLoginResult {
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
}

/**
 * Administrative login: username + Argon2id password, enforcing the single-device
 * rule. A successful login replaces any existing session, instantly invalidating
 * the previous device's refresh token via Redis.
 */
@Injectable()
export class AdminLoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
  ) {}

  async execute(
    username: string,
    password: string,
    deviceId: string,
  ): Promise<AdminLoginResult> {
    if (!username || !password || !deviceId) {
      throw new UnauthorizedException('LOGIN_FAILED');
    }

    const user = await this.users.findByUsername(username);

    // Always run a verify, even when the user is missing, to keep the response
    // time constant and avoid a username-enumeration side channel.
    const hash = user?.passwordHash ?? this.passwords.dummyHash();
    const ok = await this.passwords.verify(hash, password);

    if (!user || !ok) {
      throw new UnauthorizedException('LOGIN_FAILED');
    }
    if (!user.isAccountActivated) {
      throw new UnauthorizedException('ACCOUNT_NOT_ACTIVATED');
    }

    // Single-device rule: a new login displaces any previous device immediately.
    const refreshToken = await this.tokens.signRefresh(user.id, deviceId);
    await this.sessions.replaceActiveSession(user.id, deviceId, refreshToken);

    const accessToken = await this.tokens.signAdminAccess(user.id, user.role);

    return {
      accessToken,
      refreshToken,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
