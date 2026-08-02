import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PermitListFilter,
  PermitListPage,
  PermitListRow,
  PermitQueryRepository,
} from '../../domain/repositories/permit-query.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of the read-only visitor-permit directory query.
 *
 * SECURITY:
 *  - The SELECT is field-scoped to SAFE columns only. `id_or_phone_enc` /
 *    `id_or_phone_search_hash` (the AES-encrypted visitor id) and `token` (the signed
 *    gate-entry credential) are never selected, so they can never leak through this
 *    read path. No CryptoService is needed here — nothing is decrypted.
 *  - Filters are applied through Prisma's typed query builder (parameterized, never
 *    string-concatenated). Column names are fixed literals; user input is only ever a
 *    bound value.
 */
@Injectable()
export class PrismaPermitQueryRepository implements PermitQueryRepository {
  private readonly logger = new Logger(PrismaPermitQueryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPermits(filter: PermitListFilter): Promise<PermitListPage> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.pageSize;

    try {
      const [rows, total] = await Promise.all([
        this.prisma.permit.findMany({
          where,
          orderBy: { createdAt: 'desc' }, // newest first
          skip,
          take: filter.pageSize,
          // Explicit allowlist of SAFE columns — idOrPhone* and token are never read.
          select: {
            permitNumber: true,
            visitorName: true,
            permitType: true,
            status: true,
            host: true,
            personnelType: true,
            startDate: true,
            endDate: true,
            createdAt: true,
          },
        }),
        this.prisma.permit.count({ where }),
      ]);

      const items: PermitListRow[] = rows.map((r) => ({
        permitNumber: r.permitNumber,
        visitorName: r.visitorName,
        permitType: r.permitType,
        status: r.status,
        host: r.host,
        personnelType: r.personnelType,
        startDate: r.startDate,
        endDate: r.endDate,
        createdAt: r.createdAt,
      }));

      return { items, page: filter.page, pageSize: filter.pageSize, total };
    } catch (err) {
      this.logger.error(`Permit list query failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Optional filters as direct column matches (status/type) + a name substring. */
  private buildWhere(filter: PermitListFilter): Prisma.PermitWhereInput {
    const where: Prisma.PermitWhereInput = {};

    if (filter.status) where.status = filter.status;
    if (filter.permitType) where.permitType = filter.permitType;
    if (filter.nameQuery) {
      // Plain (non-encrypted) column; case-insensitive substring match.
      where.visitorName = { contains: filter.nameQuery, mode: 'insensitive' };
    }

    return where;
  }
}
