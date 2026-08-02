import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

/** Body for POST /accounts/employees/:selfId/service-exit. */
export class ServiceExitDto {
  // Only the exit statuses (never 'active' — use service-restore for that).
  @IsIn(['transferred', 'discharged', 'contract_ended'])
  readonly serviceStatus!: 'transferred' | 'discharged' | 'contract_ended';

  // Date-only YYYY-MM-DD; the use-case parses it and rejects a FUTURE date.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'INVALID_EXIT_DATE' })
  readonly exitDate!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  readonly note?: string;
}
