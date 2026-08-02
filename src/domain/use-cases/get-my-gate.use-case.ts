import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import {
  GateRepository,
  GATE_REPOSITORY,
} from '../repositories/gate.repository';
import {
  GuardGateService,
  GUARD_GATE_SERVICE,
} from '../services/guard-gate.service';
import { GuardGateOption } from './list-gates-for-guard.use-case';

// Same operating roles that may set a station may read their own station.
const GUARD_GATE_ROLES: Role[] = [
  'guard',
  'supervisor',
  'branch_head',
  'super_admin',
];

export interface GetMyGateInput {
  actingRole: Role;
  guardUserId: string;
}

/**
 * Resolve the guard's currently-bound station gate for display. Returns null when no
 * gate is bound, or when the bound gate has since been deleted (graceful degradation,
 * consistent with the scan flow). A deactivated-but-still-bound gate IS returned with
 * isActive=false, so the UI can warn the guard to re-pick a live station.
 */
@Injectable()
export class GetMyGateUseCase {
  constructor(
    @Inject(GUARD_GATE_SERVICE)
    private readonly guardGate: GuardGateService,
    @Inject(GATE_REPOSITORY)
    private readonly gates: GateRepository,
  ) {}

  async execute(input: GetMyGateInput): Promise<GuardGateOption | null> {
    if (!GUARD_GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_VIEW_GATE');
    }

    const gateId = await this.guardGate.getGuardGate(input.guardUserId);
    if (!gateId) return null; // no station bound yet

    const gate = await this.gates.findById(gateId);
    if (!gate) return null; // the bound gate was deleted — treat as no station

    return {
      id: gate.id,
      name: gate.name,
      direction: gate.direction,
      isActive: gate.isActive,
    };
  }
}
