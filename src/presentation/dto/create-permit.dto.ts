import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PersonnelType } from '../../domain/entities/employee.entity';
import { PermitType } from '../../domain/entities/permit.entity';

export class CreateVisitorPermitDto {
  @IsIn(['scheduled', 'single_entry'])
  readonly permitType!: PermitType;

  @IsString()
  @Length(1, 200)
  readonly visitorName!: string;

  // Visitor national id / phone — encrypted at rest by the repository.
  @IsString()
  @Length(1, 64)
  readonly idOrPhone!: string;

  @IsIn(['civilian', 'military'])
  readonly personnelType!: PersonnelType;

  @IsString()
  @Length(1, 200)
  readonly host!: string;

  @IsString()
  @Length(1, 500)
  readonly reason!: string;

  // ── Scheduled-only window (required by the use-case when permitType=scheduled) ──
  @IsOptional()
  @IsISO8601()
  readonly startDate?: string;

  @IsOptional()
  @IsISO8601()
  readonly endDate?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  readonly allowedDays?: number[]; // 0=Sun .. 6=Sat

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'INVALID_TIME_FROM' })
  readonly allowedTimeFrom?: string; // 'HH:mm'

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'INVALID_TIME_TO' })
  readonly allowedTimeTo?: string; // 'HH:mm'
}
