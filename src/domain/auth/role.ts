/**
 * The single source of truth for role vocabulary (RBAC claims).
 *
 * Nine roles: Super Admin + eight business roles. Regular employees carry the
 * `employee` role in their access token but have NO row in the `users` table —
 * they authenticate by Employee ID only. The administrative roles live in `users`.
 */
export const ROLES = [
  'super_admin',
  'branch_head',
  'supervisor',
  'guard',
  'permit_officer',
  'hr',
  'department_manager',
  'hr_head',
  'employee',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that are persisted in the `users` table (everything except `employee`). */
export const USER_ROLES = [
  'super_admin',
  'branch_head',
  'supervisor',
  'guard',
  'permit_officer',
  'hr',
  'department_manager',
  'hr_head',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
