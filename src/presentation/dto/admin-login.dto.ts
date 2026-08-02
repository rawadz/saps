import { IsString, Length } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @Length(1, 64)
  readonly username!: string;

  @IsString()
  @Length(1, 256)
  readonly password!: string;

  // Stable per-device identifier; anchors the single-device rule.
  @IsString()
  @Length(1, 128)
  readonly deviceId!: string;
}
