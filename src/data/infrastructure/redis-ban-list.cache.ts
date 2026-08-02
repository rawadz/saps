import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { BanListCache } from '../../domain/services/ban-list.cache';
import { CryptoService } from './crypto.service';

/**
 * Redis-backed ban list. The stored member is the deterministic keyed hash of the
 * employee id (identical to the self_id_search_hash column), never the plaintext
 * id. Membership is checked with a single O(1) SISMEMBER for sub-millisecond scans.
 */
@Injectable()
export class RedisBanListCache implements BanListCache {
  private readonly key = 'ban:employees';

  constructor(
    private readonly redis: Redis,
    private readonly crypto: CryptoService,
  ) {}

  private member(selfId: string): string {
    return this.crypto.deterministicHash(selfId);
  }

  async add(selfId: string): Promise<void> {
    await this.redis.sadd(this.key, this.member(selfId));
  }

  async remove(selfId: string): Promise<void> {
    await this.redis.srem(this.key, this.member(selfId));
  }

  async isBanned(selfId: string): Promise<boolean> {
    return (await this.redis.sismember(this.key, this.member(selfId))) === 1;
  }

  async rehydrate(memberHashes: string[]): Promise<void> {
    // Authoritative reset: make Redis exactly match the DB so a Redis restart can
    // never silently un-ban (stale member) or keep a stale ban.
    await this.redis.del(this.key);
    if (memberHashes.length > 0) {
      await this.redis.sadd(this.key, ...memberHashes);
    }
  }
}
