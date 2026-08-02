import { GateDirection } from '../entities/gate.entity';

/**
 * Read-side repository for the gate directory — kept separate from
 * GateRepository (the same CQRS split used by EmployeeQueryRepository).
 * The Domain owns this contract; the Data layer implements it.
 *
 * Gate rows carry no sensitive / encrypted fields, so no field allowlist
 * restriction is needed here (unlike permits where idOrPhone is AES-encrypted).
 */

/** Filter + paging for the gate listing. Values are validated by the use-case. */
export interface GateListFilter {
  isActive?: boolean; // undefined = all, true = active only, false = inactive only
  direction?: GateDirection;
  page: number; // 1-based
  pageSize: number; // already clamped by the use-case
}

/** One row in the gate directory. */
export interface GateListRow {
  id: string;
  name: string;
  direction: GateDirection;
  supportsVehicles: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A bounded page of gate rows plus the total matching the filter. */
export interface GateListPage {
  items: GateListRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GateQueryRepository {
  /** Filtered, paginated, newest-first gate listing. Reads only — never writes. */
  listGates(filter: GateListFilter): Promise<GateListPage>;
}

// Injection token — a Symbol so the Domain need not import NestJS.
export const GATE_QUERY_REPOSITORY = Symbol('GateQueryRepository');
