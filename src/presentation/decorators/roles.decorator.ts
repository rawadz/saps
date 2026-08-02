import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route (or controller) to one or more roles. Enforced by RolesGuard.
 * Example: `@Roles('guard', 'supervisor')`.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
