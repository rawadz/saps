import { Injectable } from '@nestjs/common';
import {
  VehiclePermit,
  VehicleType,
} from '../../domain/entities/vehicle-permit.entity';
import {
  CreateVehiclePermitData,
  VehiclePermitRepository,
} from '../../domain/repositories/vehicle-permit.repository';
import { CryptoService } from '../infrastructure/crypto.service';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of VehiclePermitRepository. Owner resolution lives here:
 * an employee's self id (encrypted at rest) is matched via its deterministic
 * search hash, and a visitor permit is matched by its number — both returning the
 * internal UUID used for the foreign key, or null when the owner does not exist.
 */
@Injectable()
export class PrismaVehiclePermitRepository implements VehiclePermitRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async resolveEmployeeId(selfId: string): Promise<string | null> {
    const searchHash = this.crypto.deterministicHash(selfId);
    const row = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash: searchHash },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async resolveVisitorPermitId(permitNumber: string): Promise<string | null> {
    const row = await this.prisma.permit.findUnique({
      where: { permitNumber },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async create(data: CreateVehiclePermitData): Promise<{ id: string }> {
    const created = await this.prisma.vehiclePermit.create({
      data: {
        plateNumber: data.plateNumber,
        vehicleType: data.vehicleType,
        color: data.color ?? null,
        make: data.make ?? null,
        model: data.model ?? null,
        expiresAt: data.expiresAt ?? null,
        employeeId: data.employeeId ?? null,
        visitorPermitId: data.visitorPermitId ?? null,
        status: 'active', // activated immediately on creation
        // barcodeToken is set right after, by setBarcodeToken (the use-case signs it).
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async setBarcodeToken(id: string, barcodeToken: string): Promise<void> {
    await this.prisma.vehiclePermit.update({
      where: { id },
      data: { barcodeToken },
    });
  }

  async findById(id: string): Promise<VehiclePermit | null> {
    const row = await this.prisma.vehiclePermit.findUnique({ where: { id } });
    if (!row) return null;

    return new VehiclePermit({
      id: row.id,
      plateNumber: row.plateNumber,
      // Stored values are validated on write, so the cast is safe.
      vehicleType: (row.vehicleType as VehicleType | null) ?? null,
      color: row.color,
      make: row.make,
      model: row.model,
      barcodeToken: row.barcodeToken,
      status: row.status,
      expiresAt: row.expiresAt,
      employeeId: row.employeeId,
      visitorPermitId: row.visitorPermitId,
      createdAt: row.createdAt,
    });
  }
}
