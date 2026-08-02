import { Module } from '@nestjs/common';
import { AUDIT_QUERY_REPOSITORY } from '../../domain/repositories/audit-query.repository';
import { GetDailyStatsUseCase } from '../../domain/use-cases/get-daily-stats.use-case';
import { GetGateLogUseCase } from '../../domain/use-cases/get-gate-log.use-case';
import { PrismaAuditQueryRepository } from '../../data/repositories/prisma-audit-query.repository';
import { ReportsController } from '../controllers/reports.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Reports feature module (part 5a: gate-movement log). The read-only query
 * repository is bound here (feature-specific); PrismaService comes from the global
 * InfrastructureModule. No writes, no schema changes — this module only reads.
 */
@Module({
  controllers: [ReportsController],
  providers: [
    GetGateLogUseCase,
    GetDailyStatsUseCase,
    JwtAuthGuard,
    RolesGuard,
    { provide: AUDIT_QUERY_REPOSITORY, useClass: PrismaAuditQueryRepository },
  ],
})
export class ReportsModule {}
