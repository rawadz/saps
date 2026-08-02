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
 * Query parameters for GET /permits. All optional. The global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) strips/rejects unknown params and
 * coerces page/pageSize into numbers; the use-case additionally clamps the page size.
 */
export class PermitsQueryDto {
  // Direct match on the raw stored status.
  @IsOptional()
  @IsIn(['active', 'used', 'expired', 'cancelled'])
  readonly status?: 'active' | 'used' | 'expired' | 'cancelled';

  @IsOptional()
  @IsIn(['scheduled', 'single_entry'])
  readonly permitType?: 'scheduled' | 'single_entry';

  // Case-insensitive substring match on the visitor's name.
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  // Hard upper bound mirrors GetVisitorPermitsListUseCase.MAX_PAGE_SIZE.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly pageSize?: number;
}
