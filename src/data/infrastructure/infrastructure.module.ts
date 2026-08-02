import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import Redis from 'ioredis';
import { EMPLOYEE_QUERY_REPOSITORY } from '../../domain/repositories/employee-query.repository';
import { EMPLOYEE_REPOSITORY } from '../../domain/repositories/employee.repository';
import { GATE_ACCESS_QUERY_REPOSITORY } from '../../domain/repositories/gate-access-query.repository';
import { GATE_ACCESS_REPOSITORY } from '../../domain/repositories/gate-access.repository';
import { GATE_QUERY_REPOSITORY } from '../../domain/repositories/gate-query.repository';
import { GATE_REPOSITORY } from '../../domain/repositories/gate.repository';
import { PERMIT_QUERY_REPOSITORY } from '../../domain/repositories/permit-query.repository';
import { PERMIT_REPOSITORY } from '../../domain/repositories/permit.repository';
import { USER_QUERY_REPOSITORY } from '../../domain/repositories/user-query.repository';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository';
import { VEHICLE_PERMIT_QUERY_REPOSITORY } from '../../domain/repositories/vehicle-permit-query.repository';
import { VEHICLE_PERMIT_REPOSITORY } from '../../domain/repositories/vehicle-permit.repository';
import { AUDIT_LOGGER } from '../../domain/services/audit.logger';
import { BAN_LIST_CACHE } from '../../domain/services/ban-list.cache';
import { GUARD_GATE_SERVICE } from '../../domain/services/guard-gate.service';
import { PASSWORD_SERVICE } from '../../domain/services/password.service';
import { SESSION_SERVICE } from '../../domain/services/session.service';
import { TOKEN_SERVICE } from '../../domain/services/token.service';
import { ArgonPasswordService } from './argon-password.service';
import { BanListBootstrap } from './ban-list.bootstrap';
import { CryptoService } from './crypto.service';
import { JwtTokenService } from './jwt-token.service';
import { PrismaAuditLogger } from './prisma-audit.logger';
import { PrismaService } from './prisma.service';
import { RedisProvider } from './redis.client';
import { RedisBanListCache } from './redis-ban-list.cache';
import { RedisGuardGateService } from './redis-guard-gate.service';
import { RedisSessionService } from './redis-session.service';
import { PrismaEmployeeQueryRepository } from '../repositories/prisma-employee-query.repository';
import { PrismaEmployeeRepository } from '../repositories/prisma-employee.repository';
import { PrismaGateAccessQueryRepository } from '../repositories/prisma-gate-access-query.repository';
import { PrismaGateAccessRepository } from '../repositories/prisma-gate-access.repository';
import { PrismaGateQueryRepository } from '../repositories/prisma-gate-query.repository';
import { PrismaGateRepository } from '../repositories/prisma-gate.repository';
import { PrismaPermitQueryRepository } from '../repositories/prisma-permit-query.repository';
import { PrismaPermitRepository } from '../repositories/prisma-permit.repository';
import { PrismaUserQueryRepository } from '../repositories/prisma-user-query.repository';
import { PrismaUserRepository } from '../repositories/prisma-user.repository';
import { PrismaVehiclePermitQueryRepository } from '../repositories/prisma-vehicle-permit-query.repository';
import { PrismaVehiclePermitRepository } from '../repositories/prisma-vehicle-permit.repository';

/**
 * Global infrastructure wiring. This is the composition root for cross-cutting
 * Data-layer concerns: the Prisma client, Redis, CryptoService, the RS256
 * JwtModule, and the bindings of every shared Domain interface token to its
 * concrete implementation. Feature modules consume these without re-declaring them.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        // RS256 (asymmetric): the private key signs, the public key verifies.
        privateKey: config.get<string>('jwt.privateKey'),
        publicKey: config.get<string>('jwt.publicKey'),
        signOptions: { algorithm: 'RS256' },
        // Pin the algorithm — blocks 'alg: none' and HS/RS downgrade-confusion
        // attacks. Per-token lifetimes are applied at sign time by JwtTokenService.
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
  ],
  providers: [
    PrismaService,
    RedisProvider,
    CryptoService,
    // Domain interface -> Data implementation bindings (shared app-wide).
    { provide: PASSWORD_SERVICE, useClass: ArgonPasswordService },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: SESSION_SERVICE, useClass: RedisSessionService },
    { provide: GUARD_GATE_SERVICE, useClass: RedisGuardGateService },
    { provide: EMPLOYEE_REPOSITORY, useClass: PrismaEmployeeRepository },
    {
      provide: EMPLOYEE_QUERY_REPOSITORY,
      useClass: PrismaEmployeeQueryRepository,
    },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: USER_QUERY_REPOSITORY,
      useClass: PrismaUserQueryRepository,
    },
    { provide: GATE_REPOSITORY, useClass: PrismaGateRepository },
    { provide: GATE_QUERY_REPOSITORY, useClass: PrismaGateQueryRepository },
    {
      provide: GATE_ACCESS_REPOSITORY,
      useClass: PrismaGateAccessRepository,
    },
    {
      provide: GATE_ACCESS_QUERY_REPOSITORY,
      useClass: PrismaGateAccessQueryRepository,
    },
    { provide: PERMIT_REPOSITORY, useClass: PrismaPermitRepository },
    {
      provide: PERMIT_QUERY_REPOSITORY,
      useClass: PrismaPermitQueryRepository,
    },
    {
      provide: VEHICLE_PERMIT_REPOSITORY,
      useClass: PrismaVehiclePermitRepository,
    },
    {
      provide: VEHICLE_PERMIT_QUERY_REPOSITORY,
      useClass: PrismaVehiclePermitQueryRepository,
    },
    { provide: BAN_LIST_CACHE, useClass: RedisBanListCache },
    { provide: AUDIT_LOGGER, useClass: PrismaAuditLogger },
    BanListBootstrap, // rehydrates the Redis ban list from the DB on startup
  ],
  exports: [
    PrismaService,
    Redis,
    CryptoService,
    PASSWORD_SERVICE,
    TOKEN_SERVICE,
    SESSION_SERVICE,
    GUARD_GATE_SERVICE,
    EMPLOYEE_REPOSITORY,
    EMPLOYEE_QUERY_REPOSITORY,
    USER_REPOSITORY,
    USER_QUERY_REPOSITORY,
    GATE_REPOSITORY,
    GATE_QUERY_REPOSITORY,
    GATE_ACCESS_REPOSITORY,
    GATE_ACCESS_QUERY_REPOSITORY,
    PERMIT_REPOSITORY,
    PERMIT_QUERY_REPOSITORY,
    VEHICLE_PERMIT_REPOSITORY,
    VEHICLE_PERMIT_QUERY_REPOSITORY,
    BAN_LIST_CACHE,
    AUDIT_LOGGER,
  ],
})
export class InfrastructureModule {}
