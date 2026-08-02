import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import { Gate, GateDirection } from '../entities/gate.entity';
import {
  GateRepository,
  GATE_REPOSITORY,
  UpdateGateData,
} from '../repositories/gate.repository';

const GATE_ROLES: Role[] = ['super_admin', 'department_manager', 'branch_head'];
const GATE_DIRECTIONS: GateDirection[] = ['in', 'out', 'both'];

export interface UpdateGateInput {
  actingRole: Role;
  id: string;
  data: UpdateGateData;
}

/**
 * Partially update a gate. The gate must exist; a renamed gate must not collide
 * with another gate's unique name.
 */
@Injectable()
export class UpdateGateUseCase {
  constructor(
    @Inject(GATE_REPOSITORY) private readonly gates: GateRepository,
  ) {}

  async execute(input: UpdateGateInput): Promise<Gate> {
    if (!GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('FORBIDDEN_GATE');
    }

    const current = await this.gates.findById(input.id);
    if (!current) {
      throw new NotFoundException('GATE_NOT_FOUND');
    }

    // Copy into a mutable object we can normalise; the DTO fields are readonly.
    const data: UpdateGateData = { ...input.data };

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new BadRequestException('GATE_NAME_REQUIRED');
      }
      // Only guard uniqueness when the name actually changes.
      if (name !== current.name) {
        const clash = await this.gates.findByName(name);
        if (clash && clash.id !== current.id) {
          throw new ConflictException('GATE_NAME_TAKEN');
        }
      }
      data.name = name;
    }

    if (
      data.direction !== undefined &&
      !GATE_DIRECTIONS.includes(data.direction)
    ) {
      throw new BadRequestException('INVALID_GATE_DIRECTION');
    }

    await this.gates.update(input.id, data);

    const updated = await this.gates.findById(input.id);
    if (!updated) {
      throw new InternalServerErrorException('GATE_UPDATE_FAILED');
    }
    return updated;
  }
}
