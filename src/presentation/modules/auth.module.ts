import { Module } from '@nestjs/common';
import { AdminLoginUseCase } from '../../domain/use-cases/admin-login.use-case';
import { ChangePasswordUseCase } from '../../domain/use-cases/change-password.use-case';
import { EmployeeLoginUseCase } from '../../domain/use-cases/employee-login.use-case';
import { LogoutUseCase } from '../../domain/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../../domain/use-cases/refresh-token.use-case';
import { AuthController } from '../controllers/auth.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Auth feature module: login (employee + admin), refresh, logout, change-password.
 * Account/employee management lives in AccountsModule. The use-cases depend only
 * on Domain interface tokens, all bound in the global InfrastructureModule.
 */
@Module({
  // Rate limiting is now GLOBAL (AppModule: ThrottlerModule + APP_GUARD ThrottlerGuard).
  // The login routes keep a stricter 10/60s via their own @Throttle override.
  controllers: [AuthController],
  providers: [
    EmployeeLoginUseCase,
    AdminLoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    ChangePasswordUseCase,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
