import { UserRole } from '../auth/role';

/**
 * Administrative/security account (branch head, supervisor, guard, permit
 * officer, HR, super admin). Pure domain entity.
 *
 * `passwordHash` is carried for the auth use-cases to verify against; it must
 * NEVER be serialized into an HTTP response or a log line.
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly role: UserRole,
    public readonly passwordHash: string,
    public readonly isAccountActivated: boolean,
    public readonly mustChangePassword: boolean,
    public readonly fullName?: string,
    public readonly employeeId?: string,
  ) {}
}
