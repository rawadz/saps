import { IsOptional, IsString, Length } from 'class-validator';

export class BanEmployeeDto {
  // Mandatory for the audit record (re-validated by the use-case).
  @IsString()
  @Length(3, 500)
  readonly reason!: string;
}

export class UnbanEmployeeDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly reason?: string;
}
