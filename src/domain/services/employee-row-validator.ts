import { CreateEmployeeData } from '../repositories/employee.repository';

/**
 * Domain port for validating ONE raw bulk-import row with EXACTLY the same rules as
 * a single employee creation. The Data/Presentation side implements it by running
 * the existing CreateEmployeeDto through class-validator — so the domain reuses the
 * single-create validation without importing class-validator or a presentation DTO
 * (dependency direction stays inward).
 *
 * On success it returns the cleaned CreateEmployeeData; on failure, a stable CODE
 * (mapped to an Arabic reason in the presentation layer).
 */
export type EmployeeRowValidation =
  | { ok: true; data: CreateEmployeeData }
  | { ok: false; code: string };

export interface EmployeeRowValidator {
  validate(row: unknown): EmployeeRowValidation;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const EMPLOYEE_ROW_VALIDATOR = Symbol('EmployeeRowValidator');
