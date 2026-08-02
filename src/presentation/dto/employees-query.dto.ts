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
 * Query parameters for GET /accounts/employees. All optional. The global
 * ValidationPipe (whitelist + forbidNonWhitelisted + transform) strips/rejects
 * unknown params and coerces page/pageSize from their query strings into numbers;
 * the use-case additionally clamps the page size to its hard maximum.
 */
export class EmployeesQueryDto {
  // Operator-facing status bucket; mapped to (status, isEntryBlocked) in the data layer.
  @IsOptional()
  @IsIn(['active', 'banned', 'inactive'])
  readonly status?: 'active' | 'banned' | 'inactive';

  // Case-insensitive substring match on the employee's full name.
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  // Hard upper bound mirrors GetEmployeesListUseCase.MAX_PAGE_SIZE.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly pageSize?: number;
}
