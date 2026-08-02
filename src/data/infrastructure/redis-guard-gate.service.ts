import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { GuardGateService } from '../../domain/services/guard-gate.service';

/**
 * Redis-backed store for a guard's currently-bound gate. Kept under a DEDICATED key
 * (separate from the active-session record) on purpose: the gate is set/cleared on
 * its own cadence, so a separate key avoids a read-modify-write race with
 * replaceActiveSession, which overwrites the whole session value on every login.
 *
 * No TTL — like the session, the binding persists until it is re-set or cleared
 * (logout / shift end); it never expires on a timer.
 */
@Injectable()
export class RedisGuardGateService implements GuardGateService {
  constructor(private readonly redis: Redis) {}

  private gateKey(userId: string): string {
    return `guard:gate:${userId}`;
  }

  async setGuardGate(guardUserId: string, gateId: string): Promise<void> {
    // The value is just the gate id (a UUID reference) — no JSON, nothing sensitive.
    await this.redis.set(this.gateKey(guardUserId), gateId);
  }

  async getGuardGate(guardUserId: string): Promise<string | null> {
    // redis.get already returns null when the key is absent.
    return this.redis.get(this.gateKey(guardUserId));
  }

  async clear(guardUserId: string): Promise<void> {
    await this.redis.del(this.gateKey(guardUserId));
  }
}
