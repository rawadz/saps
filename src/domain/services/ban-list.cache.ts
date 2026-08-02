/**
 * Real-time ban list, backed by Redis, so the gate scan can reject a banned
 * employee in sub-millisecond time before touching Postgres (keeping the scan
 * under its latency budget). Redis is a CACHE, not the source of truth — Postgres
 * is — so it is rehydrated from the DB on boot.
 *
 * The stored member is the deterministic keyed hash of the employee id (which is
 * exactly the self_id_search_hash column), never the plaintext id.
 */
export interface BanListCache {
  add(selfId: string): Promise<void>;
  remove(selfId: string): Promise<void>;
  isBanned(selfId: string): Promise<boolean>;

  /**
   * Authoritatively reset the cache to match the DB. `memberHashes` are the
   * self_id_search_hash values of every currently-blocked employee.
   */
  rehydrate(memberHashes: string[]): Promise<void>;
}

export const BAN_LIST_CACHE = Symbol('BanListCache');
