import { IsString, Matches } from 'class-validator';

export class EmployeeLoginDto {
  // Employee ID (self_id). Same shape the use-case re-validates server-side.
  @IsString()
  @Matches(/^[A-Za-z0-9-]{3,32}$/, { message: 'INVALID_EMPLOYEE_ID' })
  readonly selfId!: string;
}
