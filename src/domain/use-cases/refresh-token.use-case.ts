import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  UserRepository,
  USER_REPOSITORY,
} from '../repositories/user.repository';
import { TokenService, TOKEN_SERVICE } from '../services/token.service';
import { SessionService, SESSION_SERVICE } from '../services/session.service';

/**
 * Exchange a valid refresh token for a fresh access token (admin/security roles).
 *
 * Enforces the single-device rule: if the presented refresh token is not the one
 * currently stored for the user, this device has been displaced by a newer login
 * and the request is rejected — the client must log in again.
 */
@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(refreshToken: string): Promise<{ accessToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }

    const payload = await this.tokens.verifyRefresh(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('INVALID_REFRESH_TOKEN');
    }

    // Single-device check BEFORE issuing anything.
    const isCurrent = await this.sessions.isCurrentDevice(
      payload.sub,
      refreshToken,
    );
    if (!isCurrent) {
      throw new UnauthorizedException('SESSION_DISPLACED');
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.isAccountActivated) {
      throw new UnauthorizedException('LOGIN_FAILED');
    }

    const accessToken = await this.tokens.signAdminAccess(user.id, user.role);
    return { accessToken };
  }
}
