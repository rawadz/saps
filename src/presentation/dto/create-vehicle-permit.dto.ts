import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { VehicleType } from '../../domain/entities/vehicle-permit.entity';

export class CreateVehiclePermitDto {
  @IsString()
  @Length(1, 32)
  readonly plateNumber!: string;

  // خصوصي / عمومي / حكومي
  @IsIn(['private', 'public', 'government'])
  readonly vehicleType!: VehicleType;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  readonly color?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  readonly make?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  readonly model?: string;

  @IsOptional()
  @IsISO8601()
  readonly expiresAt?: string;

  // Provide EXACTLY ONE owner — the use-case enforces the "exactly one" rule.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,32}$/, { message: 'INVALID_EMPLOYEE_ID' })
  readonly ownerEmployeeSelfId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  readonly ownerVisitorPermitNumber?: string;
}
