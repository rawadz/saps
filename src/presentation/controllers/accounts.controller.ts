import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../domain/auth/role';
import { ActivateEmployeeAccountUseCase } from '../../domain/use-cases/activate-employee-account.use-case';
import { ActivateUserAccountUseCase } from '../../domain/use-cases/activate-user-account.use-case';
import { AssignEmployeeGatesUseCase } from '../../domain/use-cases/assign-employee-gates.use-case';
import { BanEmployeeUseCase } from '../../domain/use-cases/ban-employee.use-case';
import { BulkActivateEmployeesUseCase } from '../../domain/use-cases/bulk-activate-employees.use-case';
import { BulkCreateEmployeesUseCase } from '../../domain/use-cases/bulk-create-employees.use-case';
import { CreateEmployeeUseCase } from '../../domain/use-cases/create-employee.use-case';
import { CreateUserUseCase } from '../../domain/use-cases/create-user.use-case';
import { DeactivateUserAccountUseCase } from '../../domain/use-cases/deactivate-user-account.use-case';
import { ExportEmployeesBarcodesUseCase } from '../../domain/use-cases/export-employees-barcodes.use-case';
import { GetEmployeeBarcodeForAdminUseCase } from '../../domain/use-cases/get-employee-barcode-for-admin.use-case';
import { GetEmployeeGatesUseCase } from '../../domain/use-cases/get-employee-gates.use-case';
import {
  EmployeesListResult,
  GetEmployeesListUseCase,
} from '../../domain/use-cases/get-employees-list.use-case';
import { GetUsersListUseCase } from '../../domain/use-cases/get-users-list.use-case';
import { RecordEmployeeServiceExitUseCase } from '../../domain/use-cases/record-employee-service-exit.use-case';
import { RestoreEmployeeServiceUseCase } from '../../domain/use-cases/restore-employee-service.use-case';
import { UnbanEmployeeUseCase } from '../../domain/use-cases/unban-employee.use-case';
import { EmployeeBarcodeExportRow } from '../../domain/repositories/employee-query.repository';
import { EmployeeGateRow } from '../../domain/repositories/gate-access-query.repository';
import { EmployeeBarcodeView } from '../../domain/repositories/employee.repository';
import { UserListPage } from '../../domain/repositories/user-query.repository';
import { Roles } from '../decorators/roles.decorator';
import { AssignEmployeeGatesDto } from '../dto/assign-employee-gates.dto';
import { BanEmployeeDto, UnbanEmployeeDto } from '../dto/ban-employee.dto';
import { BulkActivateEmployeesDto } from '../dto/bulk-activate-employees.dto';
import { BulkCreateEmployeesDto } from '../dto/bulk-create-employees.dto';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { EmployeesQueryDto } from '../dto/employees-query.dto';
import { ServiceExitDto } from '../dto/service-exit.dto';
import { UsersQueryDto } from '../dto/users-query.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

interface BulkCreateResponse {
  created: number;
  failed: { index: number; selfId: string | null; reason: string }[];
  createdItems: { selfId: string; fullName: string }[];
}

interface BulkActivateResponse {
  activated: number;
  failed: { selfId: string; reason: string }[];
}

// Stable failure codes (from the use-cases / row validator) → Arabic reasons for the
// bulk report. The domain stays language-neutral; this i18n lives in presentation.
const BULK_REASON_AR: Record<string, string> = {
  INVALID_EMPLOYEE_ID: 'الرقم الوظيفي غير صالح (3–32: أحرف لاتينية/أرقام/شَرطة).',
  INVALID_MILITARY_ID: 'الرقم العسكري غير صالح (3–32: أحرف لاتينية/أرقام/شَرطة).',
  INVALID_FULL_NAME: 'الاسم الكامل غير صالح (1–200 حرفاً).',
  FULL_NAME_REQUIRED: 'الاسم الكامل مطلوب.',
  INVALID_PERSONNEL_TYPE: 'نوع الشخص غير صالح (مدني/عسكري).',
  FIELD_TOO_LONG: 'قيمة أحد الحقول تتجاوز الحدّ المسموح.',
  INVALID_EXTRA_FIELDS: 'حقول إضافية غير صالحة.',
  INVALID_VALUE: 'قيمة غير صالحة في الصف.',
  SELF_ID_DUPLICATED_IN_FILE: 'رقم وظيفي مكرّر داخل الملف.',
  EMPLOYEE_ALREADY_EXISTS: 'الرقم الوظيفي مُستخدَم بالفعل.',
  EMPLOYEE_NOT_FOUND: 'الموظف غير موجود.',
  NOT_AUTHORIZED_TO_CREATE: 'لا تملك صلاحية إنشاء الموظفين.',
  NOT_AUTHORIZED_TO_ACTIVATE: 'لا تملك صلاحية تفعيل الموظفين.',
};

function bulkReasonAr(code: string): string {
  return BULK_REASON_AR[code] ?? 'تعذّر تنفيذ الصف.';
}

/**
 * Account & employee management. The class-level guard is a COARSE filter; each
 * use-case enforces the FINE-grained hierarchy. Ban/unban override the class roles
 * (HR may manage employees but may not ban them).
 */
@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'branch_head', 'supervisor', 'hr', 'hr_head')
export class AccountsController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly createEmployee: CreateEmployeeUseCase,
    private readonly activateUser: ActivateUserAccountUseCase,
    private readonly activateEmployee: ActivateEmployeeAccountUseCase,
    private readonly banEmployee: BanEmployeeUseCase,
    private readonly unbanEmployee: UnbanEmployeeUseCase,
    private readonly getEmployeesList: GetEmployeesListUseCase,
    private readonly getEmployeeBarcodeForAdmin: GetEmployeeBarcodeForAdminUseCase,
    private readonly exportEmployeesBarcodes: ExportEmployeesBarcodesUseCase,
    private readonly getUsersList: GetUsersListUseCase,
    private readonly bulkCreateEmployees: BulkCreateEmployeesUseCase,
    private readonly bulkActivateEmployees: BulkActivateEmployeesUseCase,
    private readonly deactivateUser: DeactivateUserAccountUseCase,
    private readonly recordServiceExit: RecordEmployeeServiceExitUseCase,
    private readonly restoreService: RestoreEmployeeServiceUseCase,
    private readonly assignEmployeeGatesUseCase: AssignEmployeeGatesUseCase,
    private readonly getEmployeeGatesUseCase: GetEmployeeGatesUseCase,
  ) {}

  // Administrative-user directory (read-only). Sensitive — super_admin /
  // department_manager only: this method-level @Roles overrides the broader
  // class-level roles. The use-case re-checks (defense in depth) and clamps the size.
  @Get('users')
  @Roles('super_admin', 'department_manager', 'branch_head')
  listUsersHandler(
    @Query() query: UsersQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<UserListPage> {
    return this.getUsersList.execute({
      actingRole: req.user.role as Role,
      role: query.role,
      usernameQuery: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  // Create an admin user. department_manager needs this WITHOUT the employee routes,
  // so it carries an explicit method-level @Roles (class roles + department_manager)
  // rather than being added to the class. The use-case re-checks via the activation
  // hierarchy (who may create which role).
  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    'super_admin',
    'branch_head',
    'supervisor',
    'hr',
    'hr_head',
    'department_manager',
  )
  async createUserHandler(
    @Body() dto: CreateUserDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true; id: string }> {
    const { id } = await this.createUser.execute({
      actingRole: req.user.role as Role,
      username: dto.username,
      role: dto.role,
      password: dto.password,
      fullName: dto.fullName,
      employeeId: dto.employeeId,
    });
    return { success: true, id };
  }

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  async createEmployeeHandler(
    @Body() dto: CreateEmployeeDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.createEmployee.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      data: {
        selfId: dto.selfId,
        militaryId: dto.militaryId,
        fullName: dto.fullName,
        commandDepartment: dto.commandDepartment,
        branch: dto.branch,
        priority: dto.priority,
        rank: dto.rank,
        currentJobTitle: dto.currentJobTitle,
        personnelType: dto.personnelType,
        photoUrl: dto.photoUrl,
        extraFields: dto.extraFields,
      },
    });
    return { success: true };
  }

  // Bulk import: create many employees in one request. Each row is validated with
  // the SAME rules as a single create; the response is a per-row report (valid rows
  // created, invalid/duplicate rows skipped). 200 — a partial-success report.
  @Post('employees/bulk')
  @HttpCode(HttpStatus.OK)
  async bulkCreateEmployeesHandler(
    @Body() dto: BulkCreateEmployeesDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<BulkCreateResponse> {
    const report = await this.bulkCreateEmployees.execute({
      actingRole: req.user.role as Role,
      items: dto.items,
    });
    return {
      created: report.created,
      createdItems: report.createdItems,
      failed: report.failed.map((f) => ({
        index: f.index,
        selfId: f.selfId,
        reason: bulkReasonAr(f.code),
      })),
    };
  }

  // Bulk activate: activate many employees by self id, with a per-row report.
  @Post('employees/bulk-activate')
  @HttpCode(HttpStatus.OK)
  async bulkActivateEmployeesHandler(
    @Body() dto: BulkActivateEmployeesDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<BulkActivateResponse> {
    const report = await this.bulkActivateEmployees.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      selfIds: dto.selfIds,
    });
    return {
      activated: report.activated,
      failed: report.failed.map((f) => ({
        selfId: f.selfId,
        reason: bulkReasonAr(f.code),
      })),
    };
  }

  // Paginated, read-only employee directory. The class-level @Roles already limits
  // this to super_admin/branch_head/supervisor/hr; the use-case re-checks (defense in
  // depth) and clamps the page size.
  @Get('employees')
  listEmployeesHandler(
    @Query() query: EmployeesQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<EmployeesListResult> {
    return this.getEmployeesList.execute({
      actingRole: req.user.role as Role,
      status: query.status,
      nameQuery: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  // Export every employee's barcode (name + branch + token) for the admin Excel
  // export, honouring the same status/name filters as the directory. Declared BEFORE
  // the ':selfId/barcode' route so the literal 'export-barcodes' segment is never
  // captured as a :selfId param. Same roles as the single-barcode route; the use-case
  // re-checks and the repo returns a SAFE projection only — NEVER militaryId / phone.
  @Get('employees/export-barcodes')
  @Roles('super_admin', 'branch_head', 'supervisor', 'hr')
  exportEmployeeBarcodesHandler(
    @Query() query: EmployeesQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<EmployeeBarcodeExportRow[]> {
    return this.exportEmployeesBarcodes.execute({
      actingRole: req.user.role as Role,
      status: query.status,
      q: query.q,
    });
  }

  // View a specific employee's permanent barcode (for an authorized admin to issue /
  // reprint it). Narrowed to employee-management + gate-security leadership (HR
  // included; hr_head excluded), overriding the broader class roles. The use-case
  // re-checks the role and returns a SAFE projection only — NEVER militaryId. The
  // token is returned exactly as stored (never regenerated), so it stays scannable.
  @Get('employees/:selfId/barcode')
  @Roles('super_admin', 'branch_head', 'supervisor', 'hr')
  getEmployeeBarcodeHandler(
    @Param('selfId') selfId: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<EmployeeBarcodeView> {
    return this.getEmployeeBarcodeForAdmin.execute({
      actingRole: req.user.role as Role,
      selfId,
    });
  }

  // Read the gates an employee is authorised to pass — restricted to the gate-assign
  // leadership (super_admin/branch_head), overriding the broader class roles. The
  // use-case re-checks the role (defense in depth) and 404s an unknown employee.
  @Get('employees/:selfId/gates')
  @Roles('super_admin', 'branch_head')
  getEmployeeGatesHandler(
    @Param('selfId') selfId: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<EmployeeGateRow[]> {
    return this.getEmployeeGatesUseCase.execute({
      actingRole: req.user.role as Role,
      selfId,
    });
  }

  // Full (idempotent) REPLACE of an employee's authorised-gate set — PUT. The use-case
  // verifies the employee and every gate exist before the atomic write. Same narrow
  // roles as the read.
  @Put('employees/:selfId/gates')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'branch_head')
  async assignEmployeeGatesHandler(
    @Param('selfId') selfId: string,
    @Body() dto: AssignEmployeeGatesDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.assignEmployeeGatesUseCase.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      selfId,
      gateIds: dto.gateIds,
    });
    return { success: true };
  }

  // Activate an admin user. Same access set as create-user — department_manager is
  // granted here explicitly (NOT via the class) to keep it off the employee routes.
  @Post('users/:id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(
    'super_admin',
    'branch_head',
    'supervisor',
    'hr',
    'hr_head',
    'department_manager',
  )
  async activateUserHandler(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.activateUser.execute({
      actingRole: req.user.role as Role,
      targetUserId: id,
    });
    return { success: true };
  }

  // Deactivate (disable) an admin user — sensitive: super_admin / branch_head /
  // department_manager only (method-level @Roles overrides the broader class roles).
  // The use-case forbids
  // self-deactivation and disabling the last active super admin; its thrown codes
  // (403 self / not-authorized, 404 not-found, 409 last-super-admin) propagate to the
  // client, which maps them to Arabic (same code-based pattern as the other routes).
  @Post('users/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'branch_head', 'department_manager')
  async deactivateUserHandler(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.deactivateUser.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      targetUserId: id,
    });
    return { success: true };
  }

  @Post('employees/:selfId/activate')
  @HttpCode(HttpStatus.OK)
  async activateEmployeeHandler(
    @Param('selfId') selfId: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.activateEmployee.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      targetSelfId: selfId,
    });
    return { success: true };
  }

  // Ban/unban are restricted to security leadership — HR is excluded here.
  @Post('employees/:selfId/ban')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'branch_head', 'supervisor')
  async banEmployeeHandler(
    @Param('selfId') selfId: string,
    @Body() dto: BanEmployeeDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.banEmployee.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      selfId,
      reason: dto.reason,
    });
    return { success: true };
  }

  @Post('employees/:selfId/unban')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'branch_head', 'supervisor')
  async unbanEmployeeHandler(
    @Param('selfId') selfId: string,
    @Body() dto: UnbanEmployeeDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.unbanEmployee.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      selfId,
      reason: dto.reason,
    });
    return { success: true };
  }

  // Service exit (transferred/discharged/contract-ended) — an HR-domain employment
  // record (super_admin/branch_head/hr/hr_head) that blocks the gate with a documented date.
  // Use-case codes (403/404/400) propagate; the frontend maps them to Arabic.
  @Post('employees/:selfId/service-exit')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'branch_head', 'hr', 'hr_head')
  async recordServiceExitHandler(
    @Param('selfId') selfId: string,
    @Body() dto: ServiceExitDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.recordServiceExit.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      selfId,
      serviceStatus: dto.serviceStatus,
      exitDate: dto.exitDate,
      note: dto.note,
    });
    return { success: true };
  }

  // Return an employee to active service (correct a mistaken exit).
  @Post('employees/:selfId/service-restore')
  @HttpCode(HttpStatus.OK)
  @Roles('super_admin', 'branch_head', 'hr', 'hr_head')
  async restoreServiceHandler(
    @Param('selfId') selfId: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.restoreService.execute({
      actingRole: req.user.role as Role,
      actingUserId: req.user.sub,
      selfId,
    });
    return { success: true };
  }
}
