import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import { GateDirection } from '../entities/gate.entity';
import {
  GateQueryRepository,
  GATE_QUERY_REPOSITORY,
} from '../repositories/gate-query.repository';

// Roles that operate a gate (and so may list gates to pick their station).
const GUARD_GATE_ROLES: Role[] = [
  'guard',
  'supervisor',
  'branch_head',
  'super_admin',
];

export interface ListGatesForGuardInput {
  actingRole: Role;
}

/** A minimal gate option for the guard's station picker — no admin detail. */
export interface GuardGateOption {
  id: string;
  name: string;
  direction: GateDirection;
  isActive: boolean;
}

/**
 * List the ACTIVE gates a guard may pick as their station. Deliberately a narrow
 * projection (id / name / direction / isActive) — the guard chooses an operating
 * gate, not an admin record. Gates are physical and few, so the active set is
 * returned in full (one generous page). The role is re-checked here (defense in
 * depth) on top of the controller's RolesGuard.
 */
@Injectable()
export class ListGatesForGuardUseCase {
  private static readonly LIST_CAP = 500;

  constructor(
    @Inject(GATE_QUERY_REPOSITORY)
    private readonly gates: GateQueryRepository,
  ) {}

  async execute(input: ListGatesForGuardInput): Promise<GuardGateOption[]> {
    if (!GUARD_GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_LIST_GATES');
    }

    const page = await this.gates.listGates({
      isActive: true, // only operating gates can be a station
      page: 1,
      pageSize: ListGatesForGuardUseCase.LIST_CAP,
    });

    return page.items.map((g) => ({
      id: g.id,
      name: g.name,
      direction: g.direction,
      isActive: g.isActive,
    }));
  }
}
