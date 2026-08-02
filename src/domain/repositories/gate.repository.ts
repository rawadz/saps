import { Gate, GateDirection } from '../entities/gate.entity';

/** Data required to create a new gate. */
export interface CreateGateData {
  name: string;
  direction: GateDirection;
  supportsVehicles: boolean;
  createdBy?: string; // UUID of the admin user who created it
}

/** Fields that may be changed after creation (all optional). */
export interface UpdateGateData {
  name?: string;
  direction?: GateDirection;
  supportsVehicles?: boolean;
  isActive?: boolean;
}

/**
 * Command-side repository for Gate management. The Domain owns this contract;
 * the Data layer provides the implementation.
 */
export interface GateRepository {
  create(data: CreateGateData): Promise<void>;
  findById(id: string): Promise<Gate | null>;
  /** Used for duplicate-name detection before create/update. */
  findByName(name: string): Promise<Gate | null>;
  update(id: string, data: UpdateGateData): Promise<void>;
}

// Injection token — a Symbol so the Domain need not import NestJS.
export const GATE_REPOSITORY = Symbol('GateRepository');
