import { Module } from '@nestjs/common';
import { BARCODE_SERVICE } from '../../domain/services/barcode.service';
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
import { GetEmployeeSelfViewUseCase } from '../../domain/use-cases/get-employee-self-view.use-case';
import { GetEmployeesListUseCase } from '../../domain/use-cases/get-employees-list.use-case';
import { GetUsersListUseCase } from '../../domain/use-cases/get-users-list.use-case';
import { RecordEmployeeServiceExitUseCase } from '../../domain/use-cases/record-employee-service-exit.use-case';
import { RestoreEmployeeServiceUseCase } from '../../domain/use-cases/restore-employee-service.use-case';
import { UnbanEmployeeUseCase } from '../../domain/use-cases/unban-employee.use-case';
import { EMPLOYEE_ROW_VALIDATOR } from '../../domain/services/employee-row-validator';
import { HmacBarcodeService } from '../../data/infrastructure/barcode.service';
import { AccountsController } from '../controllers/accounts.controller';
import { MeController } from '../controllers/me.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ClassValidatorEmployeeRowValidator } from '../validators/class-validator-employee-row.validator';

/**
 * Account & employee management feature module (create + activate users and
 * employees, and the employee self-view). Repositories and shared services come
 * from the global InfrastructureModule; BARCODE_SERVICE is bound here as a
 * feature-local provider (same pattern as GateModule) because
 * ActivateEmployeeAccountUseCase issues the permanent barcode at activation.
 */
@Module({
  controllers: [AccountsController, MeController],
  providers: [
    CreateUserUseCase,
    CreateEmployeeUseCase,
    ActivateUserAccountUseCase,
    ActivateEmployeeAccountUseCase,
    DeactivateUserAccountUseCase,
    BanEmployeeUseCase,
    UnbanEmployeeUseCase,
    GetEmployeeSelfViewUseCase,
    GetEmployeeBarcodeForAdminUseCase,
    ExportEmployeesBarcodesUseCase,
    GetEmployeesListUseCase,
    GetUsersListUseCase,
    BulkCreateEmployeesUseCase,
    BulkActivateEmployeesUseCase,
    RecordEmployeeServiceExitUseCase,
    RestoreEmployeeServiceUseCase,
    AssignEmployeeGatesUseCase,
    GetEmployeeGatesUseCase,
    JwtAuthGuard,
    RolesGuard,
    { provide: BARCODE_SERVICE, useClass: HmacBarcodeService },
    {
      provide: EMPLOYEE_ROW_VALIDATOR,
      useClass: ClassValidatorEmployeeRowValidator,
    },
  ],
})
export class AccountsModule {}
