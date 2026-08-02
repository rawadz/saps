/**
 * Pure domain entity. No ORM decorators, no validation library, no IO — it must
 * compile with NestJS, Postgres and Redis entirely absent. Business rules that
 * belong to an employee live here, not in a controller or a SQL query.
 */
export type PersonnelType = 'civilian' | 'military';
export type EmployeeStatus = 'pending' | 'active' | 'suspended' | 'terminated';

/**
 * Service/employment exit status — SEPARATE from the ban (isEntryBlocked) and the
 * account lifecycle (status). Any non-active value blocks entry at the gate.
 */
export type ServiceStatus =
  | 'active'
  | 'transferred'
  | 'discharged'
  | 'contract_ended';

/**
 * Coarse, operator-facing status for the employee directory. It folds the lifecycle
 * `status` and the ban flag into three buckets. The ban flag OVERRIDES the lifecycle
 * status: a blocked employee always reads as 'banned', even while `status` is 'active'.
 */
export type EmployeeDisplayStatus = 'active' | 'banned' | 'inactive';

export function employeeDisplayStatus(
  status: EmployeeStatus,
  isEntryBlocked: boolean,
): EmployeeDisplayStatus {
  if (isEntryBlocked) return 'banned'; // ban takes precedence over lifecycle status
  if (status === 'active') return 'active';
  return 'inactive'; // pending | suspended | terminated (and not blocked)
}

export class Employee {
  constructor(
    public readonly employeeId: string,
    public readonly fullName: string,
    public readonly department: string,
    public readonly personnelType: PersonnelType,
    public readonly status: EmployeeStatus,
    public readonly isEntryBlocked: boolean,
    // Optional display-only attributes (default null) so every existing positional
    // `new Employee(...)` keeps compiling. Populated by the repository for the gate
    // scan's guard-facing detail block; they never affect canEnter().
    public readonly branch: string | null = null,
    public readonly priority: string | null = null,
    public readonly rank: string | null = null,
    public readonly currentJobTitle: string | null = null,
    // Service/employment exit status (default active) + its documented exit details.
    public readonly serviceStatus: ServiceStatus = 'active',
    public readonly serviceExitDate: Date | null = null,
    public readonly serviceExitNote: string | null = null,
  ) {}

  /**
   * The single source of truth for "may this person enter right now?". Resolved live
   * at scan time — never derived from anything baked into a barcode. Entry needs an
   * active account, NO ban, AND an active service status (the three are independent).
   */
  canEnter(): boolean {
    return (
      this.status === 'active' &&
      !this.isEntryBlocked &&
      this.serviceStatus === 'active'
    );
  }
}
