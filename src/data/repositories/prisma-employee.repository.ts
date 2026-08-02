import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Employee,
  ServiceStatus,
} from '../../domain/entities/employee.entity';
import {
  CreateEmployeeData,
  EmployeeBarcodeView,
  EmployeeProfile,
  EmployeeRepository,
} from '../../domain/repositories/employee.repository';
import { normalizeArabicName } from '../../domain/search/arabic-name.normalizer';
import { CryptoService } from '../infrastructure/crypto.service';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of EmployeeRepository.
 *
 * self_id and military_id are AES-encrypted at rest, so lookups use the
 * deterministic keyed search hash rather than the ciphertext. Encryption /
 * decryption happens here at the boundary; the Domain never sees ciphertext.
 */
@Injectable()
export class PrismaEmployeeRepository implements EmployeeRepository {
  private readonly logger = new Logger(PrismaEmployeeRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async findByEmployeeId(selfId: string): Promise<Employee | null> {
    const searchHash = this.crypto.deterministicHash(selfId);
    try {
      const row = await this.prisma.employee.findUnique({
        where: { selfIdSearchHash: searchHash },
      });
      if (!row) return null;

      return new Employee(
        this.crypto.decrypt(row.selfIdEnc),
        row.fullName,
        row.commandDepartment ?? '',
        row.personnelType,
        row.status,
        row.isEntryBlocked,
        row.branch ?? null,
        row.priority ?? null,
        row.rank ?? null,
        row.currentJobTitle ?? null,
        row.serviceStatus,
        row.serviceExitDate,
        row.serviceExitNote,
      );
    } catch (err) {
      // Never log the self id (sensitive) — message only.
      this.logger.error(`Employee lookup failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async findById(id: string): Promise<Employee | null> {
    try {
      // Keyed by the internal UUID (the foreign key a vehicle permit stores), not
      // the search hash. The decrypted self id is rebuilt into the entity exactly as
      // in findByEmployeeId so callers see one consistent Employee shape.
      const row = await this.prisma.employee.findUnique({ where: { id } });
      if (!row) return null;

      return new Employee(
        this.crypto.decrypt(row.selfIdEnc),
        row.fullName,
        row.commandDepartment ?? '',
        row.personnelType,
        row.status,
        row.isEntryBlocked,
        row.branch ?? null,
        row.priority ?? null,
        row.rank ?? null,
        row.currentJobTitle ?? null,
        row.serviceStatus,
        row.serviceExitDate,
        row.serviceExitNote,
      );
    } catch (err) {
      // Never log the id (an internal reference) beyond the error message.
      this.logger.error(`Employee lookup by id failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async isBanned(selfId: string): Promise<boolean> {
    const searchHash = this.crypto.deterministicHash(selfId);
    const row = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash: searchHash },
      select: { isEntryBlocked: true },
    });
    return row?.isEntryBlocked === true;
  }

  async create(data: CreateEmployeeData): Promise<void> {
    await this.prisma.employee.create({
      data: {
        selfIdEnc: this.crypto.encrypt(data.selfId),
        selfIdSearchHash: this.crypto.deterministicHash(data.selfId),
        militaryIdEnc: data.militaryId
          ? this.crypto.encrypt(data.militaryId)
          : null,
        militaryIdSearchHash: data.militaryId
          ? this.crypto.deterministicHash(data.militaryId)
          : null,
        // Phone — same AES-256-GCM + keyed-hash pattern as the ids above; never logged.
        phoneEnc: data.phone ? this.crypto.encrypt(data.phone) : null,
        phoneSearchHash: data.phone
          ? this.crypto.deterministicHash(data.phone)
          : null,
        fullName: data.fullName,
        // Search-normalized copy — MUST be recomputed by any future full-name update.
        fullNameNormalized: normalizeArabicName(data.fullName),
        commandDepartment: data.commandDepartment ?? null,
        branch: data.branch ?? null,
        priority: data.priority ?? null,
        rank: data.rank ?? null,
        currentJobTitle: data.currentJobTitle ?? null,
        personnelType: data.personnelType,
        photoUrl: data.photoUrl ?? null,
        extraFields: data.extraFields
          ? (data.extraFields as Prisma.InputJsonValue)
          : undefined,
        status: 'pending',
        isEntryBlocked: false,
      },
    });
  }

  async findProfileBySelfId(selfId: string): Promise<EmployeeProfile | null> {
    const searchHash = this.crypto.deterministicHash(selfId);
    const row = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash: searchHash },
      include: { barcode: true },
    });
    if (!row) return null;

    return {
      selfId: this.crypto.decrypt(row.selfIdEnc),
      militaryId: row.militaryIdEnc
        ? this.crypto.decrypt(row.militaryIdEnc)
        : null,
      fullName: row.fullName,
      commandDepartment: row.commandDepartment,
      branch: row.branch,
      priority: row.priority,
      rank: row.rank,
      currentJobTitle: row.currentJobTitle,
      personnelType: row.personnelType,
      status: row.status,
      photoUrl: row.photoUrl,
      barcodeToken: row.barcode?.token ?? null,
    };
  }

  async findBarcodeViewBySelfId(
    selfId: string,
  ): Promise<EmployeeBarcodeView | null> {
    const searchHash = this.crypto.deterministicHash(selfId);
    // SECURITY: an explicit SAFE-column allowlist. militaryIdEnc / phoneEnc and
    // their hashes are NEVER selected, so they cannot leak through this read path.
    const row = await this.prisma.employee.findUnique({
      where: { selfIdSearchHash: searchHash },
      select: {
        selfIdEnc: true,
        fullName: true,
        commandDepartment: true,
        branch: true,
        barcode: { select: { token: true } },
      },
    });
    if (!row) return null;

    return {
      selfId: this.crypto.decrypt(row.selfIdEnc),
      fullName: row.fullName,
      commandDepartment: row.commandDepartment,
      branch: row.branch,
      barcodeToken: row.barcode?.token ?? null,
    };
  }

  async setEntryBlocked(selfId: string, blocked: boolean): Promise<void> {
    const searchHash = this.crypto.deterministicHash(selfId);
    await this.prisma.employee.update({
      where: { selfIdSearchHash: searchHash },
      data: { isEntryBlocked: blocked },
    });
  }

  async setServiceStatus(
    selfId: string,
    serviceStatus: ServiceStatus,
    exitDate: Date | null,
    note: string | null,
  ): Promise<void> {
    const searchHash = this.crypto.deterministicHash(selfId);
    await this.prisma.employee.update({
      where: { selfIdSearchHash: searchHash },
      data: {
        serviceStatus,
        serviceExitDate: exitDate,
        serviceExitNote: note,
      },
    });
  }

  async activateWithBarcode(
    selfId: string,
    barcodeToken: string,
    generatedByUserId?: string,
  ): Promise<void> {
    const searchHash = this.crypto.deterministicHash(selfId);
    // Atomic: flip status to active AND attach the permanent barcode together.
    // The upsert makes re-activation idempotent and never regenerates the token.
    await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { selfIdSearchHash: searchHash },
        data: { status: 'active' },
        select: { id: true },
      });
      await tx.barcode.upsert({
        where: { employeeId: employee.id },
        update: {},
        create: {
          employeeId: employee.id,
          token: barcodeToken,
          generatedBy: generatedByUserId ?? null,
        },
      });
    });
  }
}
