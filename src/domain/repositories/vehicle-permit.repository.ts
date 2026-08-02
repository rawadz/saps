import { VehiclePermit, VehicleType } from '../entities/vehicle-permit.entity';

/**
 * Data for creating a vehicle permit. Exactly ONE owner reference (employeeId or
 * visitorPermitId, already resolved to an internal UUID) must be set — the
 * use-case guarantees this and the DB CHECK is the backstop.
 */
export interface CreateVehiclePermitData {
  plateNumber: string;
  vehicleType: VehicleType;
  color?: string;
  make?: string;
  model?: string;
  expiresAt?: Date;
  employeeId?: string; // internal employee UUID
  visitorPermitId?: string; // internal visitor-permit UUID
}

/**
 * The Domain owns this contract; the Data layer implements it. Owner resolution
 * lives here (data layer) because mapping a selfId / permit_number to an internal
 * UUID — and confirming the owner exists — is a persistence concern; it lets the
 * use-case verify existence without depending on the employee/permit entities.
 */
export interface VehiclePermitRepository {
  /** Resolve an employee's internal UUID from their self id, or null if absent. */
  resolveEmployeeId(selfId: string): Promise<string | null>;

  /** Resolve a visitor permit's internal UUID from its number, or null if absent. */
  resolveVisitorPermitId(permitNumber: string): Promise<string | null>;

  create(data: CreateVehiclePermitData): Promise<{ id: string }>;

  /** Persist the vehicle's signed barcode token after creation (signed by the use-case). */
  setBarcodeToken(id: string, barcodeToken: string): Promise<void>;

  findById(id: string): Promise<VehiclePermit | null>;
}

export const VEHICLE_PERMIT_REPOSITORY = Symbol('VehiclePermitRepository');
