import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EmployeeProfile,
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';

/**
 * Return an employee's OWN profile + permanent barcode. The caller always passes
 * the self id taken from their verified access token (`sub`), so an employee can
 * only ever read their own record — never another's.
 */
@Injectable()
export class GetEmployeeSelfViewUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
  ) {}

  async execute(selfId: string): Promise<EmployeeProfile> {
    const profile = await this.employees.findProfileBySelfId(selfId);
    if (!profile) {
      throw new NotFoundException('EMPLOYEE_NOT_FOUND');
    }
    return profile;
  }
}
