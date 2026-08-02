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
 * Query parameters for GET /accounts/users. All optional. The global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) strips/rejects unknown params and
 * coerces page/pageSize into numbers; the use-case additionally clamps the page size.
 */
export class UsersQueryDto {
  // One of the administrative roles — the users table never holds 'employee'.
  @IsOptional()
  @IsIn([
    'super_admin',
    'branch_head',
    'supervisor',
    'guard',
    'permit_officer',
    'hr',
    'department_manager',
    'hr_head',
  ])
  readonly role?:
    | 'super_admin'
    | 'branch_head'
    | 'supervisor'
    | 'guard'
    | 'permit_officer'
    | 'hr'
    | 'department_manager'
    | 'hr_head';

  // Case-insensitive substring match on the username.
  @IsOptional()
  @IsString()
  @Length(1, 64)
  readonly q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number;

  // Hard upper bound mirrors GetUsersListUseCase.MAX_PAGE_SIZE.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  readonly pageSize?: number;
}
