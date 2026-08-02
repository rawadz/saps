import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { PersonnelType } from '../../domain/entities/employee.entity';

export class CreateEmployeeDto {
  // Employee ID (self_id). Encrypted at rest; matched via its search hash.
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,32}$/, { message: 'INVALID_EMPLOYEE_ID' })
  readonly selfId!: string;

  // Optional military id. Encrypted at rest; partial-unique among non-null values.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,32}$/, { message: 'INVALID_MILITARY_ID' })
  readonly militaryId?: string;

  // Contact phone — REQUIRED for new employees (the DB column stays nullable for older
  // rows). Encrypted at rest; lenient format (digits, +, (), -, spaces).
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+()\-\s]{6,20}$/, { message: 'INVALID_PHONE' })
  readonly phone!: string;

  @IsString()
  @Length(1, 200)
  readonly fullName!: string;

  @IsIn(['civilian', 'military'])
  readonly personnelType!: PersonnelType;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  readonly commandDepartment?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  readonly branch?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  readonly priority?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  readonly rank?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  readonly currentJobTitle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1024)
  readonly photoUrl?: string;

  @IsOptional()
  @IsObject()
  readonly extraFields?: Record<string, unknown>;
}
