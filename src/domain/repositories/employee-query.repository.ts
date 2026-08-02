import { EmployeeStatus, PersonnelType } from '../entities/employee.entity';

/**
 * Read side of the employee directory — a dedicated query repository, separate from
 * the command-oriented EmployeeRepository (the same CQRS split the reports feature
 * uses with AuditQueryRepository). The Domain owns this contract; the Data layer
 * implements it.
 *
 * SECURITY: this side returns SAFE fields only. The operational `selfId` is decrypted
 * at the boundary because admins need it to act on a row (activate / ban / view); the
 * encrypted `military_id` is NEVER selected or returned, and neither is any search
 * hash, the photo, or the free-form `extra_fields` (which may hold sensitive HR data).
 */

/** Operator-facing status filter; translated to column predicates in the data layer. */
export type EmployeeStatusFilter = 'active' | 'banned' | 'inactive';

/** Filter + paging for the directory query. The use-case validates/clamps these. */
export interface EmployeeListFilter {
  // Display-status bucket; the data layer maps it to (status, isEntryBlocked) columns.
  status?: EmployeeStatusFilter;
  // Free-text search term. The data layer tokenizes + Arabic-normalizes it for an
  // order-free name match, and — if the term is ID-shaped — also matches the exact
  // employee number via its search hash. Raw term; the use-case only trims it.
  nameQuery?: string;
  page: number; // 1-based, already normalized by the use-case
  pageSize: number; // already clamped to the hard maximum by the use-case
}

/**
 * One row of the directory. Carries the RAW lifecycle `status` and the `isEntryBlocked`
 * flag so the use-case can derive the coarse display status in the Domain layer; the
 * data layer performs no business logic, only mapping + decryption.
 */
export interface EmployeeListRow {
  selfId: string; // decrypted at the boundary; the only identifier returned
  fullName: string;
  personnelType: PersonnelType;
  status: EmployeeStatus; // raw lifecycle status
  isEntryBlocked: boolean; // ban flag (drives the derived display status)
  commandDepartment: string | null;
  branch: string | null;
  createdAt: Date;
}

/** A bounded page of directory rows plus the total matching the filter. */
export interface EmployeeListPage {
  items: EmployeeListRow[];
  page: number;
  pageSize: number;
  total: number;
}

/** Filter for the barcode export — the SAME predicates as the directory (status bucket
 *  + full-name substring), but NO paging: an export needs every matching employee. */
export interface EmployeeBarcodeExportFilter {
  status?: EmployeeStatusFilter;
  nameQuery?: string;
}

/**
 * One SAFE export row: name + branch + the permanent barcode token, keyed by the
 * decrypted self id. The barcode is a gate-entry CREDENTIAL, so this projection is
 * deliberately kept OUT of the always-on directory list and exposed only here, on an
 * explicit export. militaryId / phone / national id are NEVER included.
 */
export interface EmployeeBarcodeExportRow {
  selfId: string;
  fullName: string;
  branch: string | null;
  barcodeToken: string | null; // null for a not-yet-activated employee
}

export interface EmployeeQueryRepository {
  /** Filtered, paginated, newest-first directory listing. Reads only — never writes. */
  listEmployees(filter: EmployeeListFilter): Promise<EmployeeListPage>;

  /**
   * All employees matching the filter, with their barcode token — for the admin
   * Excel export. Reads only; SAFE projection (no militaryId / phone). Unpaginated by
   * design (the export needs the full set).
   */
  listBarcodesForExport(
    filter: EmployeeBarcodeExportFilter,
  ): Promise<EmployeeBarcodeExportRow[]>;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const EMPLOYEE_QUERY_REPOSITORY = Symbol('EmployeeQueryRepository');
