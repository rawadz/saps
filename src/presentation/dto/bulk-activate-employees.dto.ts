import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Body for POST /accounts/employees/bulk-activate — the self ids to activate. */
export class BulkActivateEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  readonly selfIds!: string[];
}
