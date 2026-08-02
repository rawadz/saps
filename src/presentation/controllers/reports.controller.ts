import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../domain/auth/role';
import {
  DailyStats,
  GateLogPage,
} from '../../domain/repositories/audit-query.repository';
import { GetDailyStatsUseCase } from '../../domain/use-cases/get-daily-stats.use-case';
import { GetGateLogUseCase } from '../../domain/use-cases/get-gate-log.use-case';
import { Roles } from '../decorators/roles.decorator';
import { GateLogQueryDto } from '../dto/gate-log-query.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Reports — read-only. Restricted to the roles that may review gate activity
 * (super_admin, branch_head, supervisor, department_manager, hr_head, hr) — never a
 * guard or permit officer. The controller is thin: it validates
 * the query, forwards the acting role
 * for the in-use-case authorization check (defense in depth), and returns the page.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'branch_head', 'supervisor', 'department_manager', 'hr_head', 'hr')
export class ReportsController {
  constructor(
    private readonly getGateLog: GetGateLogUseCase,
    private readonly getDailyStats: GetDailyStatsUseCase,
  ) {}

  @Get('gate-log')
  gateLog(
    @Query() query: GateLogQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<GateLogPage> {
    return this.getGateLog.execute({
      actingRole: req.user.role as Role,
      from: query.from,
      to: query.to,
      gateName: query.gateName,
      result: query.result,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('daily-stats')
  dailyStats(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<DailyStats> {
    return this.getDailyStats.execute({ actingRole: req.user.role as Role });
  }
}
