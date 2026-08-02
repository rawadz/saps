import { ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';

/**
 * Body for POST /accounts/employees/bulk. Each item is validated PER ROW by the
 * use-case (via EmployeeRowValidator) so one bad row never rejects the whole batch
 * — the response is a per-row report instead. Here we only enforce the array shape
 * and the hard size cap (a batch over the cap is rejected outright).
 */
export class BulkCreateEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  readonly items!: unknown[];
}
