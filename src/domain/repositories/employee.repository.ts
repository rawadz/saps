import {
  Employee,
  EmployeeStatus,
  PersonnelType,
  ServiceStatus,
} from '../entities/employee.entity';

/** Data needed to create a new employee record (plaintext; the repo encrypts). */
export interface CreateEmployeeData {
  selfId: string;
  militaryId?: string;
  phone?: string;
  fullName: string;
  commandDepartment?: string;
  branch?: string;
  priority?: string;
  rank?: string;
  currentJobTitle?: string;
  personnelType: PersonnelType;
  photoUrl?: string;
  extraFields?: Record<string, unknown>;
}

/**
 * Read model for an employee's own profile view. Decrypted sensitive ids are
 * included because the employee is viewing THEIR OWN record; never expose this
 * for anyone else.
 */
export interface EmployeeProfile {
  selfId: string;
  militaryId: string | null;
  fullName: string;
  commandDepartment: string | null;
  branch: string | null;
  priority: string | null;
  rank: string | null;
  currentJobTitle: string | null;
  personnelType: PersonnelType;
  status: EmployeeStatus;
  photoUrl: string | null;
  barcodeToken: string | null; // null until the account is activated
}

/**
 * SAFE read model for the admin "view an employee's barcode" route. Deliberately a
 * NARROW projection: it carries the self id (decrypted), display name/department/
 * branch, and the permanent barcode token — and NOTHING sensitive. It must NEVER
 * include militaryId, phone, or any national id (unlike EmployeeProfile, which the
 * self-view alone may decrypt). This separate type makes the "what leaves the
 * server" surface auditable in one place.
 */
export interface EmployeeBarcodeView {
  selfId: string;
  fullName: string;
  commandDepartment: string | null;
  branch: string | null;
  barcodeToken: string | null; // null until the account is activated
}

/**
 * The Domain owns this contract; the Data layer implements it. Use-cases depend
 * on this abstraction (Dependency Inversion), never on a concrete Postgres class.
 */
export interface EmployeeRepository {
  findByEmployeeId(employeeId: string): Promise<Employee | null>;

  /**
   * Resolve an employee by their INTERNAL database UUID (not the self id). Used by
   * owner-status inheritance (e.g. a vehicle permit stores the owner's UUID foreign
   * key); the gate resolves the owner's live status from it. Returns null if absent.
   */
  findById(id: string): Promise<Employee | null>;

  isBanned(employeeId: string): Promise<boolean>;

  /** Create a new employee (starts in `pending` status, no barcode yet). */
  create(data: CreateEmployeeData): Promise<void>;

  /** Full self-view profile (incl. the permanent barcode token), keyed by self id. */
  findProfileBySelfId(selfId: string): Promise<EmployeeProfile | null>;

  /**
   * SAFE barcode view for the admin issue/view route — selects ONLY the safe
   * columns (no militaryId / phone / national id is ever read), keyed by self id.
   */
  findBarcodeViewBySelfId(selfId: string): Promise<EmployeeBarcodeView | null>;

  /** Flip the entry-block flag (ban / unban). The reason is recorded in the audit. */
  setEntryBlocked(selfId: string, blocked: boolean): Promise<void>;

  /** Set the service/employment exit status + its documented date/note (or clear it). */
  setServiceStatus(
    selfId: string,
    serviceStatus: ServiceStatus,
    exitDate: Date | null,
    note: string | null,
  ): Promise<void>;

  /**
   * Activate the account AND attach the permanent barcode, atomically. The
   * barcode is created ONCE here and never regenerated (idempotent on re-run).
   */
  activateWithBarcode(
    selfId: string,
    barcodeToken: string,
    generatedByUserId?: string,
  ): Promise<void>;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const EMPLOYEE_REPOSITORY = Symbol('EmployeeRepository');
