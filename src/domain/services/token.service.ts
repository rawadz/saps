import { UserRole } from '../auth/role';

/** The verified contents of a refresh token. */
export interface RefreshPayload {
  sub: string; // user id
  deviceId: string;
}

/**
 * JWT contract. All tokens are signed with RS256 (asymmetric). Implemented in
 * the Data layer over the framework's JWT service.
 */
export interface TokenService {
  /** Read-only, self-scoped access token for a regular employee. */
  signEmployeeAccess(selfId: string): Promise<string>;

  /** Access token for an administrative user (carries the role claim). */
  signAdminAccess(userId: string, role: UserRole): Promise<string>;

  /** Refresh token bound to a device (anchor of the single-device rule). */
  signRefresh(userId: string, deviceId: string): Promise<string>;

  /** Verify a refresh token's signature/type; returns its payload or null. */
  verifyRefresh(token: string): Promise<RefreshPayload | null>;
}

export const TOKEN_SERVICE = Symbol('TokenService');
