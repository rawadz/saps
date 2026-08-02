import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EmployeeBarcodeExportFilter,
  EmployeeBarcodeExportRow,
  EmployeeListFilter,
  EmployeeListPage,
  EmployeeListRow,
  EmployeeQueryRepository,
} from '../../domain/repositories/employee-query.repository';
import { CryptoService } from '../infrastructure/crypto.service';
import { PrismaService } from '../infrastructure/prisma.service';
import { buildEmployeeWhere } from './employee-where.builder';

/**
 * Prisma implementation of the read-only employee directory query.
 *
 * SECURITY:
 *  - The SELECT is field-scoped: it pulls `self_id_enc` (decrypted here at the
 *    boundary) and non-sensitive operational columns ONLY. `military_id_enc`, the
 *    `*_search_hash` columns, `photo_url` and the free-form `extra_fields` are never
 *    selected, so nothing sensitive can leak through this read path.
 *  - Filters are applied through Prisma's typed query builder (parameterized, never
 *    string-concatenated). Column names are fixed literals; user input is only ever
 *    a bound value.
 */
@Injectable()
export class PrismaEmployeeQueryRepository implements EmployeeQueryRepository {
  private readonly logger = new Logger(PrismaEmployeeQueryRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async listEmployees(filter: EmployeeListFilter): Promise<EmployeeListPage> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.pageSize;

    try {
      const [rows, total] = await Promise.all([
        this.prisma.employee.findMany({
          where,
          orderBy: { createdAt: 'desc' }, // newest first
          skip,
          take: filter.pageSize,
          // Explicit allowlist of SAFE columns — sensitive fields are never read here.
          select: {
            selfIdEnc: true,
            fullName: true,
            personnelType: true,
            status: true,
            isEntryBlocked: true,
            commandDepartment: true,
            branch: true,
            createdAt: true,
          },
        }),
        this.prisma.employee.count({ where }),
      ]);

      const items: EmployeeListRow[] = rows.map((r) => ({
        // Decrypt at the boundary; the Domain never sees ciphertext.
        selfId: this.crypto.decrypt(r.selfIdEnc),
        fullName: r.fullName,
        personnelType: r.personnelType,
        status: r.status,
        isEntryBlocked: r.isEntryBlocked,
        commandDepartment: r.commandDepartment,
        branch: r.branch,
        createdAt: r.createdAt,
      }));

      return { items, page: filter.page, pageSize: filter.pageSize, total };
    } catch (err) {
      // Never log self ids (sensitive) — message only.
      this.logger.error(`Employee list query failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async listBarcodesForExport(
    filter: EmployeeBarcodeExportFilter,
  ): Promise<EmployeeBarcodeExportRow[]> {
    // Reuse the directory's EXACT filter semantics (status bucket + full-name
    // substring). page/pageSize are irrelevant to the predicate, so pass dummies.
    const where = this.buildWhere({
      status: filter.status,
      nameQuery: filter.nameQuery,
      page: 1,
      pageSize: 1,
    });

    try {
      // SECURITY: explicit SAFE allowlist — self_id_enc (decrypted at the boundary),
      // full_name, branch, and the barcode token via the relation. militaryIdEnc /
      // phoneEnc and every *_search_hash are NEVER selected, so no credential beyond
      // the (intended) barcode leaves the server. Unpaginated: the export needs all.
      const rows = await this.prisma.employee.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          selfIdEnc: true,
          fullName: true,
          branch: true,
          barcode: { select: { token: true } },
        },
      });

      return rows.map((r) => ({
        selfId: this.crypto.decrypt(r.selfIdEnc),
        fullName: r.fullName,
        branch: r.branch,
        barcodeToken: r.barcode?.token ?? null,
      }));
    } catch (err) {
      this.logger.error(
        `Barcode export query failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Build the directory predicate. Status mapping + the tokenized/normalized name search
   * + exact employee-number (self_id hash) search live in the pure `buildEmployeeWhere`
   * (unit-tested without a DB); the deterministic hash is supplied from CryptoService.
   */
  private buildWhere(filter: EmployeeListFilter): Prisma.EmployeeWhereInput {
    return buildEmployeeWhere(
      { status: filter.status, nameQuery: filter.nameQuery },
      (value) => this.crypto.deterministicHash(value),
    );
  }
}
