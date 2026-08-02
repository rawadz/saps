import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { UserRole } from '../../domain/auth/role';
import {
  RefreshPayload,
  TokenService,
} from '../../domain/services/token.service';

/**
 * RS256 JWT issuance/verification. The signing algorithm (RS256) and the
 * private/public keys come from the globally-registered JwtModule; here we only
 * set the per-token claims and lifetimes (from config). Lifetimes bound the
 * rotation window only — sessions end on logout or device displacement, not a clock.
 */
@Injectable()
export class JwtTokenService implements TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signEmployeeAccess(selfId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: selfId, role: 'employee', scope: 'self:read' },
      this.ttl('jwt.accessTtl', '12h'),
    );
  }

  signAdminAccess(userId: string, role: UserRole): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, role },
      this.ttl('jwt.accessTtl', '12h'),
    );
  }

  signRefresh(userId: string, deviceId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, deviceId, type: 'refresh' },
      this.ttl('jwt.refreshTtl', '30d'),
    );
  }

  async verifyRefresh(token: string): Promise<RefreshPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        deviceId?: string;
        type?: string;
      }>(token);
      if (payload.type !== 'refresh' || !payload.deviceId) {
        return null;
      }
      return { sub: payload.sub, deviceId: payload.deviceId };
    } catch {
      return null;
    }
  }

  /**
   * Build sign options carrying just the lifetime. @types/jsonwebtoken types
   * `expiresIn` as a `StringValue` template literal that a plain config string
   * does not satisfy, yet jsonwebtoken accepts the string ('15m', '30d') at
   * runtime — so we assert through to the expected type.
   */
  private ttl(
    key: 'jwt.accessTtl' | 'jwt.refreshTtl',
    fallback: string,
  ): JwtSignOptions {
    const value = this.config.get<string>(key) ?? fallback;
    return { expiresIn: value as unknown as JwtSignOptions['expiresIn'] };
  }
}
