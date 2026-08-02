import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { validatePassword } from '../auth/password-policy';
import {
  UserRepository,
  USER_REPOSITORY,
} from '../repositories/user.repository';
import {
  PasswordService,
  PASSWORD_SERVICE,
} from '../services/password.service';

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Change an administrative user's password. Used both for the forced first-login
 * change (`mustChangePassword`) and for voluntary changes. Verifies the current
 * password, enforces the full password policy on the new one, then stores the new
 * Argon2id hash and clears the `mustChangePassword` flag (handled atomically by
 * the repository's updatePassword).
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const { userId, currentPassword, newPassword } = input;

    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('LOGIN_FAILED');
    }

    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new UnauthorizedException('INVALID_CURRENT_PASSWORD');
    }

    if (newPassword === currentPassword) {
      throw new BadRequestException(['PASSWORD_MUST_DIFFER_FROM_CURRENT']);
    }

    const policy = validatePassword(newPassword, { username: user.username });
    if (!policy.valid) {
      throw new BadRequestException(policy.errors);
    }

    const newHash = await this.passwords.hash(newPassword);
    await this.users.updatePassword(userId, newHash);
  }
}
