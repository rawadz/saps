import { UserRole } from '../auth/role';

/**
 * Read side of the administrative-user directory — a dedicated query repository,
 * separate from the command-oriented UserRepository (the same CQRS split used by
 * EmployeeQueryRepository / PermitQueryRepository). The Domain owns this contract.
 *
 * SECURITY: SAFE fields only. The Argon2id `password_hash` is NEVER selected or
 * returned, and neither is the internal employee link. Only non-sensitive account
 * fields are exposed — and only to a super_admin (enforced by the use-case + guard).
 */

/** Filter + paging for the directory query. The use-case validates/clamps these. */
export interface UserListFilter {
  role?: UserRole; // direct column match (the 6 administrative roles)
  // Case-insensitive substring match on username (a plain, non-encrypted column).
  usernameQuery?: string;
  page: number; // 1-based, already normalized by the use-case
  pageSize: number; // already clamped to the hard maximum by the use-case
}

/** One row of the directory. SAFE fields only — never the password hash. */
export interface UserListRow {
  id: string;
  username: string;
  role: UserRole;
  fullName: string | null;
  isAccountActivated: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

/** A bounded page of directory rows plus the total matching the filter. */
export interface UserListPage {
  items: UserListRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UserQueryRepository {
  /** Filtered, paginated, newest-first administrative-user listing. Reads only. */
  listUsers(filter: UserListFilter): Promise<UserListPage>;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const USER_QUERY_REPOSITORY = Symbol('UserQueryRepository');
