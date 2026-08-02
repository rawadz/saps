import { PersonnelType } from '../entities/employee.entity';
import { PermitStatus, PermitType } from '../entities/permit.entity';

/**
 * Read side of the visitor-permit directory — a dedicated query repository, separate
 * from the command-oriented PermitRepository (the same CQRS split used by
 * EmployeeQueryRepository / AuditQueryRepository). The Domain owns this contract; the
 * Data layer implements it.
 *
 * SECURITY: SAFE fields only. The visitor's id/phone (idOrPhoneEnc — AES-encrypted)
 * and the signed permit `token` (a gate-entry credential) are NEVER selected or
 * returned through this read path; only non-sensitive operational columns are.
 */

/** Filter + paging for the directory query. The use-case validates/clamps these. */
export interface PermitListFilter {
  // Direct column matches on the raw stored values.
  status?: PermitStatus; // active / used / expired / cancelled
  permitType?: PermitType; // scheduled / single_entry
  // Case-insensitive substring match on visitor_name (a plain, non-encrypted column).
  nameQuery?: string;
  page: number; // 1-based, already normalized by the use-case
  pageSize: number; // already clamped to the hard maximum by the use-case
}

/** One row of the directory. SAFE fields only — no idOrPhone, no token. */
export interface PermitListRow {
  permitNumber: string;
  visitorName: string;
  permitType: PermitType;
  status: PermitStatus; // raw stored status (no derivation)
  host: string;
  personnelType: PersonnelType | null;
  startDate: Date | null; // scheduled-only (null for single-entry)
  endDate: Date | null; // scheduled-only
  createdAt: Date;
}

/** A bounded page of directory rows plus the total matching the filter. */
export interface PermitListPage {
  items: PermitListRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PermitQueryRepository {
  /** Filtered, paginated, newest-first visitor-permit listing. Reads only — never writes. */
  listPermits(filter: PermitListFilter): Promise<PermitListPage>;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const PERMIT_QUERY_REPOSITORY = Symbol('PermitQueryRepository');
