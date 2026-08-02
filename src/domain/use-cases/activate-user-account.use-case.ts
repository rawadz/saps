import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role } from '../auth/role';
import {
  UserRepository,
  USER_REPOSITORY,
} from '../repositories/user.repository';

export interface ActivateUserInput {
  actingRole: Role;
  targetUserId: string;
}

/**
 * Activate an administrative user account, enforcing the activation hierarchy:
 * the acting role must be permitted to activate the target's role (e.g. a
 * supervisor may activate guards but not branch heads). The coarse route guard
 * limits WHO may call this; this use-case enforces WHICH targets they may act on.
 */
@Injectable()
export class ActivateUserAccountUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(input: ActivateUserInput): Promise<void> {
    const target = await this.users.findById(input.targetUserId);
    if (!target) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (!canActivate(input.actingRole, target.role)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_ACTIVATE');
    }

    await this.users.setActivated(input.targetUserId, true);
  }
}
