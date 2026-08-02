/**
 * Active-session contract for the role-dependent single-device rule. Backed by
 * Redis so a displaced device is rejected on its very next refresh. Sessions
 * never expire on a timer — only logout or device displacement ends them.
 *
 * Employees are not subject to this rule (unlimited devices), so the employee
 * login path never touches it.
 */
export interface SessionService {
  /** Replace any existing session, instantly invalidating the previous device. */
  replaceActiveSession(
    userId: string,
    deviceId: string,
    refreshToken: string,
  ): Promise<void>;

  /** True only if the presented refresh token matches the stored active one. */
  isCurrentDevice(userId: string, refreshToken: string): Promise<boolean>;

  /** End the session (logout). */
  clear(userId: string): Promise<void>;
}

export const SESSION_SERVICE = Symbol('SessionService');
