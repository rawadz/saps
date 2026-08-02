import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  BanListCache,
  BAN_LIST_CACHE,
} from '../../domain/services/ban-list.cache';
import { PrismaService } from './prisma.service';

/**
 * On startup, rehydrate the Redis ban list from Postgres (the source of truth) so
 * a Redis restart can never silently change who is banned. A failure is logged
 * but does not crash boot — each scan still resolves live status from the DB.
 */
@Injectable()
export class BanListBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(BanListBootstrap.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BAN_LIST_CACHE) private readonly banList: BanListCache,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const blocked = await this.prisma.employee.findMany({
        where: { isEntryBlocked: true },
        select: { selfIdSearchHash: true },
      });
      await this.banList.rehydrate(blocked.map((e) => e.selfIdSearchHash));
      this.logger.log(`Ban list rehydrated: ${blocked.length} entr(y/ies)`);
    } catch (err) {
      this.logger.error(`Ban list rehydrate failed: ${(err as Error).message}`);
    }
  }
}
