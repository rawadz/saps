import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import { Gate } from '../entities/gate.entity';
import {
  GateRepository,
  GATE_REPOSITORY,
} from '../repositories/gate.repository';

const GATE_ROLES: Role[] = ['super_admin', 'department_manager', 'branch_head'];

export interface GetGateInput {
  actingRole: Role;
  id: string;
}

@Injectable()
export class GetGateUseCase {
  constructor(
    @Inject(GATE_REPOSITORY) private readonly gates: GateRepository,
  ) {}

  async execute(input: GetGateInput): Promise<Gate> {
    if (!GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('FORBIDDEN_GATE');
    }

    const gate = await this.gates.findById(input.id);
    if (!gate) {
      throw new NotFoundException('GATE_NOT_FOUND');
    }
    return gate;
  }
}
