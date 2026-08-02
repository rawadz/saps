import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  AdminLoginResult,
  AdminLoginUseCase,
} from '../../domain/use-cases/admin-login.use-case';
import { ChangePasswordUseCase } from '../../domain/use-cases/change-password.use-case';
import { EmployeeLoginUseCase } from '../../domain/use-cases/employee-login.use-case';
import { LogoutUseCase } from '../../domain/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../../domain/use-cases/refresh-token.use-case';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { EmployeeLoginDto } from '../dto/employee-login.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly employeeLogin: EmployeeLoginUseCase,
    private readonly adminLogin: AdminLoginUseCase,
    private readonly refreshToken: RefreshTokenUseCase,
    private readonly logout: LogoutUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  @Post('employee/login')
  @HttpCode(HttpStatus.OK)
  // Stricter brute-force limit than the global default: 10 attempts / 60s per IP (the
  // global ThrottlerGuard reads this @Throttle override). 11th in the window -> HTTP 429.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  employeeLoginHandler(
    @Body() dto: EmployeeLoginDto,
  ): Promise<{ accessToken: string }> {
    return this.employeeLogin.execute(dto.selfId);
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  // Stricter than the global default: 10 attempts / 60s per IP. 11th -> HTTP 429.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  adminLoginHandler(@Body() dto: AdminLoginDto): Promise<AdminLoginResult> {
    return this.adminLogin.execute(dto.username, dto.password, dto.deviceId);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshHandler(@Body() dto: RefreshDto): Promise<{ accessToken: string }> {
    return this.refreshToken.execute(dto.refreshToken);
  }

  // ── Authenticated ────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logoutHandler(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.logout.execute(req.user.sub);
    return { success: true };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePasswordHandler(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    await this.changePassword.execute({
      userId: req.user.sub,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
    return { success: true };
  }
}
