import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { USER_ROLES, UserRole } from '../../domain/auth/role';

export class CreateUserDto {
  @IsString()
  @Length(3, 64)
  readonly username!: string;

  // Must be one of the administrative roles (never 'employee', which has no user row).
  @IsIn([...USER_ROLES])
  readonly role!: UserRole;

  // Upper bound only; the full policy is enforced by the use-case (one source).
  @IsString()
  @Length(1, 256)
  readonly password!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  readonly fullName?: string;

  // Optional link to an existing employee record (internal UUID).
  @IsOptional()
  @IsString()
  @Length(0, 64)
  readonly employeeId?: string;
}
