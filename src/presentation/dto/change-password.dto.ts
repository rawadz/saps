import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(1, 256)
  readonly currentPassword!: string;

  // Upper bound only here; the full policy (length, categories, common-password,
  // username) is enforced by the use-case so the rules live in one place.
  @IsString()
  @Length(1, 256)
  readonly newPassword!: string;
}
