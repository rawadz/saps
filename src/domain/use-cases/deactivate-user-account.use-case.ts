import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canDeactivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import {
  UserRepository,
  USER_REPOSITORY,
} from '../repositories/user.repository';

export interface DeactivateUserInput {
  actingRole: Role;
  actingUserId: string;
  targetUserId: string;
}

/**
 * Deactivate an administrative user (isAccountActivated -> false) WITHOUT deleting it,
 * so the audit trail is preserved and the account can be re-activated later. Admin
 * login AND token refresh already reject a deactivated account, so this takes effect
 * on the next attempt (an already-issued access token still lasts until its own expiry
 * — there is no token denylist).
 *
 * Guards:
 *  - A user can NEVER deactivate themselves (avoids self-lockout).
 *  - The acting role must be allowed to deactivate the target's role (canDeactivate):
 *    a super admin may deactivate anyone; lower roles only what they could activate.
 *  - The LAST active super admin can never be deactivated (avoids locking everyone out
 *    of the super-admin-only management surface).
 */
@Injectable()
export class DeactivateUserAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(input: DeactivateUserInput): Promise<void> {
    // Self-lockout guard first — independent of who the target turns out to be.
    if (input.actingUserId === input.targetUserId) {
      throw new ForbiddenException('CANNOT_DEACTIVATE_SELF');
    }

    const target = await this.users.findById(input.targetUserId);
    if (!target) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (!canDeactivate(input.actingRole, target.role)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_DEACTIVATE');
    }

    // Never disable the last ACTIVE super admin.
    if (target.role === 'super_admin' && target.isAccountActivated) {
      const activeSupers = await this.users.countActiveByRole('super_admin');
      if (activeSupers <= 1) {
        throw new ConflictException('CANNOT_DEACTIVATE_LAST_SUPER_ADMIN');
      }
    }

    await this.users.setActivated(input.targetUserId, false);
  }
}
