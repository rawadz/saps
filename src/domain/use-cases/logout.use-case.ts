import { Inject, Injectable } from '@nestjs/common';
import {
  GuardGateService,
  GUARD_GATE_SERVICE,
} from '../services/guard-gate.service';
import { SessionService, SESSION_SERVICE } from '../services/session.service';

/**
 * Logout — the canonical end-of-session event. Clears the Redis session so the
 * refresh token can no longer be matched. For employees (no session entry) this
 * is a no-op server-side; the client simply discards its access token.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(GUARD_GATE_SERVICE) private readonly guardGate: GuardGateService,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.sessions.clear(userId);
    // Also drop the guard's station binding so no stale gate lingers after logout.
    await this.guardGate.clear(userId);
  }
}
