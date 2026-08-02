import { Role } from './role';

/**
 * The strict account-activation hierarchy (pure domain logic, no framework).
 *
 *   • Super Admin   → may activate anyone.
 *   • Dept. manager → builds its team: branch head, supervisor, hr_head, hr, guard,
 *                     permit officer. NOT super_admin, NOT itself, NOT regular employees.
 *   • Branch head   → activates supervisors, HR heads and every account below them.
 *   • Supervisor    → activates guards, permit officers and regular employees.
 *   • HR officer    → activates guards, permit officers and regular employees.
 *   • HR head       → mirrors the HR officer.
 *   • Everyone else → may not activate anyone.
 *
 * A freshly created account is inactive until an authorized role activates it.
 */
export const ACTIVATION_MATRIX: Record<Role, Role[]> = {
  super_admin: [
    'branch_head',
    'supervisor',
    'guard',
    'permit_officer',
    'hr',
    'employee',
    'department_manager',
    'hr_head',
  ],
  // Builds and manages its own team, but may NOT clone its post (no department_manager),
  // touch super_admin (untouchable), or manage regular employees.
  department_manager: [
    'branch_head',
    'supervisor',
    'hr_head',
    'hr',
    'guard',
    'permit_officer',
  ],
  branch_head: [
    'supervisor',
    'guard',
    'permit_officer',
    'hr',
    'employee',
    'hr_head',
  ],
  supervisor: ['guard', 'permit_officer', 'employee'],
  hr: ['guard', 'permit_officer', 'employee'],
  hr_head: ['guard', 'permit_officer', 'employee'], // mirrors hr
  guard: [],
  permit_officer: [],
  employee: [],
};

/** True if `actingRole` is allowed to activate an account of `targetRole`. */
export function canActivate(actingRole: Role, targetRole: Role): boolean {
  return (ACTIVATION_MATRIX[actingRole] ?? []).includes(targetRole);
}

/**
 * True if `actingRole` may DEACTIVATE an account of `targetRole`. A super admin may
 * deactivate any role (self-deactivation and the last-active-super-admin case are
 * guarded separately in the use-case); every other role may deactivate only the
 * roles it could activate. This intentionally differs from `canActivate`: no role's
 * activation list contains `super_admin`, yet a super admin must be able to
 * deactivate a peer super admin.
 */
export function canDeactivate(actingRole: Role, targetRole: Role): boolean {
  if (actingRole === 'super_admin') return true;
  return canActivate(actingRole, targetRole);
}
