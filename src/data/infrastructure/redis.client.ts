import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Provides a single shared ioredis client, configured from the resolved
 * `redis.url`. Redis holds active sessions and the real-time ban list, which is
 * what keeps the gate scan under its latency budget.
 *
 * Registered under the `Redis` class token so consumers can inject it directly:
 * `constructor(private readonly redis: Redis)`.
 */
export const RedisProvider: Provider = {
  provide: Redis,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const logger = new Logger('Redis');

    const client = new Redis(config.get<string>('redis.url') ?? '', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    client.on('error', (err: Error) => {
      logger.error(`Redis client error: ${err.message}`);
    });

    return client;
  },
};
