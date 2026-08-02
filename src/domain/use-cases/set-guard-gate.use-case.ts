import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../auth/role';
import {
  GateRepository,
  GATE_REPOSITORY,
} from '../repositories/gate.repository';
import {
  GuardGateService,
  GUARD_GATE_SERVICE,
} from '../services/guard-gate.service';

// A guard binds their OWN station, so the operating gate roles may set it.
const GUARD_GATE_ROLES: Role[] = [
  'guard',
  'supervisor',
  'branch_head',
  'super_admin',
];

export interface SetGuardGateInput {
  actingRole: Role;
  guardUserId: string;
  gateId: string;
}

/**
 * Bind the calling guard to the gate they are stationed at. The binding lives in the
 * guard's server-side store and is what the scan flow trusts (never the request body).
 * The role is re-checked here (defense in depth) on top of the controller's RolesGuard.
 */
@Injectable()
export class SetGuardGateUseCase {
  constructor(
    @Inject(GUARD_GATE_SERVICE)
    private readonly guardGate: GuardGateService,
    @Inject(GATE_REPOSITORY)
    private readonly gates: GateRepository,
  ) {}

  async execute(input: SetGuardGateInput): Promise<void> {
    if (!GUARD_GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_SET_GATE');
    }
    if (!input.gateId?.trim()) {
      throw new BadRequestException('INVALID_GATE_ID');
    }

    const gate = await this.gates.findById(input.gateId);
    if (!gate) {
      throw new NotFoundException('GATE_NOT_FOUND');
    }
    // Unlike a gate-ACCESS grant (Phase 3-c, which only checks existence), a guard
    // may only STATION at an OPERATING gate — never a deactivated one. The scan flow
    // resolves the gate's name live from this binding, so it must point at a live gate.
    if (!gate.isActive) {
      throw new BadRequestException('GATE_INACTIVE');
    }

    await this.guardGate.setGuardGate(input.guardUserId, input.gateId);
  }
}
