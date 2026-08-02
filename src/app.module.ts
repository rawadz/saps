import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { InfrastructureModule } from './data/infrastructure/infrastructure.module';
import { HealthController } from './presentation/controllers/health.controller';
import { AccountsModule } from './presentation/modules/accounts.module';
import { AuthModule } from './presentation/modules/auth.module';
import { GateModule } from './presentation/modules/gate.module';
import { GatesModule } from './presentation/modules/gates.module';
import { PermitsModule } from './presentation/modules/permits.module';
import { ReportsModule } from './presentation/modules/reports.module';
import { VehiclePermitsModule } from './presentation/modules/vehicle-permits.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv, // fail fast on a bad/incomplete environment
    }),
    // Global rate limiting: a sane default ceiling of 100 requests / 60s per client IP
    // on EVERY route (ttl is milliseconds in throttler v6). The login routes tighten
    // this to 10/60s via their own @Throttle; /health opts out via @SkipThrottle. The
    // default in-memory store is per-process — switch to a Redis store when scaling out.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    // Global: provides the Postgres pool, Redis client, CryptoService and the
    // RS256 JwtModule to the whole application.
    InfrastructureModule,
    AuthModule,
    AccountsModule,
    GateModule,
    GatesModule,
    PermitsModule,
    VehiclePermitsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  // Apply the ThrottlerGuard to every route globally (per-route @Throttle still overrides).
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
