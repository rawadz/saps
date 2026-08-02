import { Injectable } from '@nestjs/common';
import { AuditEntry, AuditLogger } from '../../domain/services/audit.logger';
import { CryptoService } from './crypto.service';
import { PrismaService } from './prisma.service';

/**
 * Persists audit events to the append-only `audit_logs` table (UPDATE/DELETE are
 * blocked at the DB level by a trigger). The timestamp is set server-side by the
 * column default.
 *
 * For an `employee` subject, the reference is stored as a non-reversible keyed
 * hash — never the plaintext self id — so the audit trail correlates repeated
 * events for the same person without ever logging a sensitive id.
 */
@Injectable()
export class PrismaAuditLogger implements AuditLogger {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const subjectRef =
      entry.subjectType === 'employee'
        ? this.crypto.deterministicHash(entry.subjectRef)
        : entry.subjectRef;

    await this.prisma.auditLog.create({
      data: {
        type: entry.type,
        subjectType: entry.subjectType,
        subjectRef,
        actorUserId: entry.actorUserId ?? null,
        gateName: entry.gateName ?? null,
        gateId: entry.gateId ?? null,
        result: entry.result,
        reason: entry.reason ?? null,
      },
    });
  }
}
