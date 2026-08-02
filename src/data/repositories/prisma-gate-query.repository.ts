import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GateListFilter,
  GateListPage,
  GateListRow,
  GateQueryRepository,
} from '../../domain/repositories/gate-query.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of the read-only gate directory query.
 * Gate rows carry no encrypted fields, so no CryptoService is needed and no
 * field allowlist restriction applies (unlike the permit query repo which must
 * exclude idOrPhoneEnc and token). All filters flow through Prisma's typed
 * query builder — never string-concatenated.
 */
@Injectable()
export class PrismaGateQueryRepository implements GateQueryRepository {
  private readonly logger = new Logger(PrismaGateQueryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async listGates(filter: GateListFilter): Promise<GateListPage> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.pageSize;

    try {
      const [rows, total] = await Promise.all([
        this.prisma.gate.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: filter.pageSize,
        }),
        this.prisma.gate.count({ where }),
      ]);

      const items: GateListRow[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        direction: r.direction as GateListRow['direction'],
        supportsVehicles: r.supportsVehicles,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return { items, page: filter.page, pageSize: filter.pageSize, total };
    } catch (err) {
      this.logger.error(`Gate list query failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private buildWhere(filter: GateListFilter): Prisma.GateWhereInput {
    const where: Prisma.GateWhereInput = {};

    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    if (filter.direction !== undefined) where.direction = filter.direction;

    return where;
  }
}
