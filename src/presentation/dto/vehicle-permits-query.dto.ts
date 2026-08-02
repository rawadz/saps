import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Query parameters for GET /vehicle-permits. All optional. The global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) strips/rejects unknown params and
 * coerces page/pageSize into numbers; the use-case additionally clamps the page size.
 */
export class VehiclePermitsQueryDto {
  // Raw stored status (a free string in the schema) — direct match. Bounded length.
  @IsOptional()
  @IsString()
  @Length(1, 32)
  readonly status?: string;

  @IsOptional()
  @IsIn(['private', 'public', 'government'])
  readonly vehicleType?: 'private' | 'public' | 'government';

  // Case-insensitive substring match on the plate number.
  @IsOptional()
  @IsString()
  @Length(1, 32)
  readonly q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  // Hard upper bound mirrors GetVehiclePermitsListUseCase.MAX_PAGE_SIZE.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly pageSize?: number;
}
