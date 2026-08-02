import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CreateEmployeeData } from '../../domain/repositories/employee.repository';
import {
  EmployeeRowValidation,
  EmployeeRowValidator,
} from '../../domain/services/employee-row-validator';
import { CreateEmployeeDto } from '../dto/create-employee.dto';

// Codes for fields whose DTO constraints carry no custom UPPER_SNAKE message.
const FIELD_CODE: Record<string, string> = {
  selfId: 'INVALID_EMPLOYEE_ID',
  militaryId: 'INVALID_MILITARY_ID',
  phone: 'INVALID_PHONE',
  fullName: 'INVALID_FULL_NAME',
  personnelType: 'INVALID_PERSONNEL_TYPE',
  commandDepartment: 'FIELD_TOO_LONG',
  branch: 'FIELD_TOO_LONG',
  priority: 'FIELD_TOO_LONG',
  rank: 'FIELD_TOO_LONG',
  currentJobTitle: 'FIELD_TOO_LONG',
  photoUrl: 'FIELD_TOO_LONG',
  extraFields: 'INVALID_EXTRA_FIELDS',
};

/** Map the first validation error to a stable code (custom message wins). */
function firstCode(errors: ValidationError[]): string {
  const e = errors[0];
  const messages = Object.values(e.constraints ?? {});
  // CreateEmployeeDto sets custom UPPER_SNAKE codes for the id fields.
  const custom = messages.find((m) => /^[A-Z][A-Z_]+$/.test(m));
  return custom ?? FIELD_CODE[e.property] ?? 'INVALID_VALUE';
}

/**
 * Validates a raw bulk row with the SAME class-validator rules as the single-create
 * endpoint (whitelist + forbidNonWhitelisted, mirroring the global ValidationPipe),
 * so bulk rows are held to exactly the single-create strictness.
 */
@Injectable()
export class ClassValidatorEmployeeRowValidator implements EmployeeRowValidator {
  validate(row: unknown): EmployeeRowValidation {
    const dto = plainToInstance(CreateEmployeeDto, row);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      return { ok: false, code: firstCode(errors) };
    }

    const data: CreateEmployeeData = {
      selfId: dto.selfId,
      militaryId: dto.militaryId,
      phone: dto.phone,
      fullName: dto.fullName,
      commandDepartment: dto.commandDepartment,
      branch: dto.branch,
      priority: dto.priority,
      rank: dto.rank,
      currentJobTitle: dto.currentJobTitle,
      personnelType: dto.personnelType,
      photoUrl: dto.photoUrl,
      extraFields: dto.extraFields,
    };
    return { ok: true, data };
  }
}
