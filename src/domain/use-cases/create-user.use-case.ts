import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { canActivate } from '../auth/activation-policy';
import { Role, UserRole } from '../auth/role';
import { validatePassword } from '../auth/password-policy';
import {
  UserRepository,
  USER_REPOSITORY,
} from '../repositories/user.repository';
import {
  PasswordService,
  PASSWORD_SERVICE,
} from '../services/password.service';

export interface CreateUserInput {
  actingRole: Role;
  username: string;
  role: UserRole;
  password: string;
  fullName?: string;
  employeeId?: string;
}

/**
 * Create a new administrative user. Authorization reuses the activation hierarchy
 * (a role may create only the roles it may activate — e.g. a branch head may
 * create supervisors/guards/permit officers/HR/HR heads, but not another branch
 * head, a super admin, or a department manager). The initial password must satisfy
 * the policy. The account is
 * created INACTIVE (needs activation) with mustChangePassword = true.
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
  ) {}

  async execute(input: CreateUserInput): Promise<{ id: string }> {
    if (!canActivate(input.actingRole, input.role)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_CREATE');
    }

    if (!input.username || input.username.trim().length < 3) {
      throw new BadRequestException('INVALID_USERNAME');
    }

    const policy = validatePassword(input.password, {
      username: input.username,
    });
    if (!policy.valid) {
      throw new BadRequestException(policy.errors);
    }

    const existing = await this.users.findByUsername(input.username);
    if (existing) {
      throw new ConflictException('USERNAME_TAKEN');
    }

    const passwordHash = await this.passwords.hash(input.password);
    const { id } = await this.users.create({
      username: input.username,
      role: input.role,
      passwordHash,
      fullName: input.fullName,
      employeeId: input.employeeId,
    });
    return { id };
  }
}
