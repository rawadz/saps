import { UserRole } from '../auth/role';
import { User } from '../entities/user.entity';

/** Data needed to create a new administrative user (password already hashed). */
export interface CreateUserData {
  username: string;
  role: UserRole;
  passwordHash: string;
  fullName?: string;
  employeeId?: string;
}

/**
 * Contract for administrative-user persistence. Implemented in the Data layer.
 */
export interface UserRepository {
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;

  /**
   * Create a new admin account and return its generated id. It starts INACTIVE
   * (must be activated by an authorized role) and with mustChangePassword = true
   * (first-login change).
   */
  create(data: CreateUserData): Promise<{ id: string }>;

  /** Set a new password hash and clear the `mustChangePassword` flag atomically. */
  updatePassword(id: string, newPasswordHash: string): Promise<void>;

  /** Activate / deactivate the account. */
  setActivated(id: string, activated: boolean): Promise<void>;

  /** Count ACTIVE accounts of a given role (guards the last active super admin). */
  countActiveByRole(role: UserRole): Promise<number>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
