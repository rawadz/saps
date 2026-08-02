import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { PrismaService } from '../../data/infrastructure/prisma.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  postgres: boolean;
  redis: boolean;
}

/**
 * Liveness/readiness probe. Confirms the API can actually reach Postgres (via
 * Prisma) and Redis. Returns only up/down booleans — never connection strings or
 * credentials.
 */
@Controller('health')
// Exempt the liveness/readiness probe from the global rate limit — monitors poll it
// frequently and must never be throttled into a false "down".
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([
      this.pingPostgres(),
      this.pingRedis(),
    ]);

    return {
      status: postgres && redis ? 'ok' : 'degraded',
      postgres,
      redis,
    };
  }

  private async pingPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
