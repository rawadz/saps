import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VehicleType } from '../../domain/entities/vehicle-permit.entity';
import {
  VehicleOwnerType,
  VehiclePermitListFilter,
  VehiclePermitListPage,
  VehiclePermitListRow,
  VehiclePermitQueryRepository,
} from '../../domain/repositories/vehicle-permit-query.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of the read-only vehicle-permit directory query.
 *
 * SECURITY:
 *  - The SELECT is field-scoped to SAFE columns. `barcode_token` (the signed gate
 *    credential) is NEVER selected. The owner NAME is pulled via a relation `select`
 *    that reads ONLY the plain `employees.full_name` / `permits.visitor_name` columns
 *    — never an encrypted id, phone, the visitor's idOrPhone, or any token.
 *  - The internal owner UUIDs are selected solely to derive ownerType; they are NOT
 *    returned in the row.
 *  - Filters use Prisma's typed query builder (parameterized, never concatenated).
 */
@Injectable()
export class PrismaVehiclePermitQueryRepository
  implements VehiclePermitQueryRepository
{
  private readonly logger = new Logger(PrismaVehiclePermitQueryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async listVehiclePermits(
    filter: VehiclePermitListFilter,
  ): Promise<VehiclePermitListPage> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.pageSize;

    try {
      const [rows, total] = await Promise.all([
        this.prisma.vehiclePermit.findMany({
          where,
          orderBy: { createdAt: 'desc' }, // newest first
          skip,
          take: filter.pageSize,
          select: {
            id: true,
            plateNumber: true,
            vehicleType: true,
            status: true,
            color: true,
            make: true,
            model: true,
            // Internal — used ONLY to derive ownerType; never returned in the row.
            employeeId: true,
            visitorPermitId: true,
            createdAt: true,
            // Safe owner-name join: only the plain name columns are read.
            employee: { select: { fullName: true } },
            visitorPermit: { select: { visitorName: true } },
          },
        }),
        this.prisma.vehiclePermit.count({ where }),
      ]);

      const items: VehiclePermitListRow[] = rows.map((r) => {
        // Exactly one owner reference is set (DB CHECK vehicle_must_have_owner).
        const ownerType: VehicleOwnerType = r.employeeId ? 'employee' : 'visitor';
        const ownerName =
          r.employee?.fullName ?? r.visitorPermit?.visitorName ?? null;
        return {
          id: r.id,
          plateNumber: r.plateNumber,
          // Stored values are validated on write, so the cast is safe.
          vehicleType: (r.vehicleType as VehicleType | null) ?? null,
          status: r.status,
          color: r.color,
          make: r.make,
          model: r.model,
          ownerType,
          ownerName,
          createdAt: r.createdAt,
        };
      });

      return { items, page: filter.page, pageSize: filter.pageSize, total };
    } catch (err) {
      this.logger.error(
        `Vehicle permit list query failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /** Optional filters: status/type as direct column matches + a plate substring. */
  private buildWhere(
    filter: VehiclePermitListFilter,
  ): Prisma.VehiclePermitWhereInput {
    const where: Prisma.VehiclePermitWhereInput = {};

    if (filter.status) where.status = filter.status;
    if (filter.vehicleType) where.vehicleType = filter.vehicleType;
    if (filter.plateQuery) {
      // Plain (non-encrypted) column; case-insensitive substring match.
      where.plateNumber = { contains: filter.plateQuery, mode: 'insensitive' };
    }

    return where;
  }
}
