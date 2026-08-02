import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Query parameters for GET /reports/gate-log. All optional. The global
 * ValidationPipe (whitelist + transform) strips unknown params and coerces
 * page/pageSize from their query strings into numbers; the use-case additionally
 * clamps the page size to its hard maximum.
 */
export class GateLogQueryDto {
  // Inclusive lower bound on the scan time (created_at).
  @IsOptional()
  @IsISO8601()
  readonly from?: string;

  // Inclusive upper bound on the scan time (created_at).
  @IsOptional()
  @IsISO8601()
  readonly to?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly gateName?: string;

  // Display vocabulary; mapped to success/failure in the data layer.
  @IsOptional()
  @IsIn(['GREEN', 'RED'])
  readonly result?: 'GREEN' | 'RED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  // Hard upper bound mirrors GetGateLogUseCase.MAX_PAGE_SIZE.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly pageSize?: number;
}
