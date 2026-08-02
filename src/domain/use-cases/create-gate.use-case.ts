import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import { Gate, GateDirection } from '../entities/gate.entity';
import {
  GateRepository,
  GATE_REPOSITORY,
} from '../repositories/gate.repository';

// Only leadership roles may manage gates (mirrors GateAdminController's @Roles).
const GATE_ROLES: Role[] = ['super_admin', 'department_manager', 'branch_head'];
const GATE_DIRECTIONS: GateDirection[] = ['in', 'out', 'both'];

export interface CreateGateInput {
  actingRole: Role;
  createdBy: string; // UUID of the acting admin user (FK -> users.id)
  name: string;
  direction: GateDirection;
  supportsVehicles: boolean;
  isActive?: boolean;
}

/**
 * Create a gate. The acting role is re-checked here (defense in depth alongside
 * the controller's RolesGuard) and the human name is enforced unique.
 */
@Injectable()
export class CreateGateUseCase {
  constructor(
    @Inject(GATE_REPOSITORY) private readonly gates: GateRepository,
  ) {}

  async execute(input: CreateGateInput): Promise<Gate> {
    if (!GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('FORBIDDEN_GATE');
    }

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('GATE_NAME_REQUIRED');
    }
    if (!GATE_DIRECTIONS.includes(input.direction)) {
      throw new BadRequestException('INVALID_GATE_DIRECTION');
    }

    // Pre-check the unique human name so the caller gets a clean 409 rather than a
    // raw DB unique-constraint error.
    const existing = await this.gates.findByName(name);
    if (existing) {
      throw new ConflictException('GATE_NAME_TAKEN');
    }

    // The frozen 2-a-2 CreateGateData carries no isActive field (the column defaults
    // to true at the DB). To honour an explicit "create as inactive" request without
    // touching the domain/data layer, we create (active) then deactivate via update.
    await this.gates.create({
      name,
      direction: input.direction,
      supportsVehicles: input.supportsVehicles,
      createdBy: input.createdBy,
    });

    const created = await this.gates.findByName(name);
    if (!created) {
      // The row we just inserted (unique name) must be retrievable; its absence is
      // a genuine internal fault, not a client error.
      throw new InternalServerErrorException('GATE_CREATE_FAILED');
    }

    if (input.isActive === false) {
      await this.gates.update(created.id, { isActive: false });
      const deactivated = await this.gates.findById(created.id);
      return deactivated ?? created;
    }

    return created;
  }
}
