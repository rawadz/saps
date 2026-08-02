import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import { TokenService, TOKEN_SERVICE } from '../services/token.service';

// Phase 1 feature gate — employees are QR-card holders only and do NOT log in yet.
// Flip to true to re-enable employee login (the full flow below is kept intact). The
// `: boolean` keeps the kept code reachable for the type-checker.
const EMPLOYEE_LOGIN_ENABLED: boolean = false;

/**
 * Employee login: Employee ID (self_id) ONLY, no password. Issues a read-only,
 * self-scoped access token. Employees are exempt from the single-device rule, so
 * there is no refresh token and no Redis session — they may use any number of
 * devices concurrently.
 */
@Injectable()
export class EmployeeLoginUseCase {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employees: EmployeeRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenService,
  ) {}

  async execute(selfId: string): Promise<{ accessToken: string }> {
    // Phase 1: employees are QR-card holders only and do NOT log in. This feature gate
    // disables the path; everything below is kept as the intended behavior and is
    // re-enabled by flipping EMPLOYEE_LOGIN_ENABLED to true. The gate is unaffected —
    // the barcode is issued at activation and verified at /gate/scan, never here.
    if (!EMPLOYEE_LOGIN_ENABLED) {
      throw new ForbiddenException('EMPLOYEE_LOGIN_DISABLED');
    }

    // Validate shape before touching the DB.
    if (!selfId || !/^[A-Za-z0-9-]{3,32}$/.test(selfId)) {
      throw new UnauthorizedException('INVALID_EMPLOYEE_ID');
    }

    const employee = await this.employees.findByEmployeeId(selfId);
    if (!employee) {
      // Generic message — never reveal whether the ID exists.
      throw new UnauthorizedException('LOGIN_FAILED');
    }
    if (employee.status !== 'active') {
      throw new UnauthorizedException('ACCOUNT_NOT_ACTIVE');
    }

    const accessToken = await this.tokens.signEmployeeAccess(
      employee.employeeId,
    );
    return { accessToken };
  }
}
