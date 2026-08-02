import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { SessionService } from '../../domain/services/session.service';

/**
 * Redis-backed single-device session store. We persist only a HASH of the active
 * refresh token (never the raw token). No TTL is set — sessions do not expire on
 * a timer; they end on logout (clear) or when a new login overwrites the entry.
 */
@Injectable()
export class RedisSessionService implements SessionService {
  constructor(private readonly redis: Redis) {}

  private key(userId: string): string {
    return `session:active:${userId}`;
  }

  private fingerprint(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  async replaceActiveSession(
    userId: string,
    deviceId: string,
    refreshToken: string,
  ): Promise<void> {
    const value = JSON.stringify({
      deviceId,
      fp: this.fingerprint(refreshToken),
    });
    await this.redis.set(this.key(userId), value);
  }

  async isCurrentDevice(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const raw = await this.redis.get(this.key(userId));
    if (!raw) return false;
    try {
      const { fp } = JSON.parse(raw) as { fp: string };
      return fp === this.fingerprint(refreshToken);
    } catch {
      return false;
    }
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}
