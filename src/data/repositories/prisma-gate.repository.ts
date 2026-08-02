import { Injectable } from '@nestjs/common';
import { Gate } from '../../domain/entities/gate.entity';
import {
  CreateGateData,
  GateRepository,
  UpdateGateData,
} from '../../domain/repositories/gate.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of GateRepository.
 * Gate rows contain no encrypted fields, so CryptoService is not needed here.
 * All queries go through Prisma's typed query builder (parameterized — no raw
 * string concatenation).
 */
@Injectable()
export class PrismaGateRepository implements GateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateGateData): Promise<void> {
    await this.prisma.gate.create({
      data: {
        name: data.name,
        direction: data.direction,
        supportsVehicles: data.supportsVehicles,
        createdBy: data.createdBy ?? null,
      },
    });
  }

  async findById(id: string): Promise<Gate | null> {
    const row = await this.prisma.gate.findUnique({ where: { id } });
    if (!row) return null;
    return this.toEntity(row);
  }

  async findByName(name: string): Promise<Gate | null> {
    const row = await this.prisma.gate.findUnique({ where: { name } });
    if (!row) return null;
    return this.toEntity(row);
  }

  async update(id: string, data: UpdateGateData): Promise<void> {
    await this.prisma.gate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.direction !== undefined && { direction: data.direction }),
        ...(data.supportsVehicles !== undefined && {
          supportsVehicles: data.supportsVehicles,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  private toEntity(row: {
    id: string;
    name: string;
    direction: string;
    supportsVehicles: boolean;
    isActive: boolean;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Gate {
    return new Gate(
      row.id,
      row.name,
      row.direction as Gate['direction'],
      row.supportsVehicles,
      row.isActive,
      row.createdBy,
      row.createdAt,
      row.updatedAt,
    );
  }
}
