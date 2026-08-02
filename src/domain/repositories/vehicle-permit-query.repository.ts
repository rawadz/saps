import { VehicleType } from '../entities/vehicle-permit.entity';

/**
 * Read side of the vehicle-permit directory — a dedicated query repository, separate
 * from the command-oriented VehiclePermitRepository (the same CQRS split used by
 * EmployeeQueryRepository / PermitQueryRepository). The Domain owns this contract.
 *
 * SECURITY: SAFE fields only. The signed `barcode_token` (a gate-entry credential) is
 * NEVER selected or returned. The owner NAME is resolved by joining the plain,
 * non-sensitive `employees.full_name` / `permits.visitor_name` columns (the same join
 * the gate-log report uses) — no encrypted id, phone, or token ever leaves this path.
 */

export type VehicleOwnerType = 'employee' | 'visitor';

/** Filter + paging for the directory query. The use-case validates/clamps these. */
export interface VehiclePermitListFilter {
  status?: string; // raw stored status (free string in the schema) — direct match
  vehicleType?: VehicleType; // direct column match
  // Case-insensitive substring match on plate_number (a plain, non-encrypted column).
  plateQuery?: string;
  page: number; // 1-based, already normalized by the use-case
  pageSize: number; // already clamped to the hard maximum by the use-case
}

/** One row of the directory. SAFE fields only — no barcodeToken, no internal owner UUIDs. */
export interface VehiclePermitListRow {
  id: string; // the UUID a detail lookup (GET /vehicle-permits/:id) needs
  plateNumber: string;
  vehicleType: VehicleType | null;
  status: string; // raw stored status (no derivation)
  color: string | null;
  make: string | null;
  model: string | null;
  ownerType: VehicleOwnerType; // exactly one owner (DB CHECK guarantees this)
  ownerName: string | null; // joined employee.fullName / permit.visitorName
  createdAt: Date;
}

/** A bounded page of directory rows plus the total matching the filter. */
export interface VehiclePermitListPage {
  items: VehiclePermitListRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface VehiclePermitQueryRepository {
  /** Filtered, paginated, newest-first vehicle-permit listing. Reads only — never writes. */
  listVehiclePermits(
    filter: VehiclePermitListFilter,
  ): Promise<VehiclePermitListPage>;
}

// Injection token — a Symbol so the Domain need not import NestJS to declare it.
export const VEHICLE_PERMIT_QUERY_REPOSITORY = Symbol(
  'VehiclePermitQueryRepository',
);
