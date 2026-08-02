import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import {
  GateListRow,
  GateQueryRepository,
  GATE_QUERY_REPOSITORY,
} from '../repositories/gate-query.repository';

const GATE_ROLES: Role[] = ['super_admin', 'department_manager', 'branch_head'];

export interface GetGatesListInput {
  actingRole: Role;
}

/**
 * Read the full gate directory. Gates are physical entry points and therefore few
 * in number, so the list is returned unpaginated. The frozen 2-a-2 query repo is
 * itself paginated, so we request one generous page that comfortably exceeds any
 * realistic gate count rather than dumping an unbounded result.
 */
@Injectable()
export class GetGatesListUseCase {
  private static readonly LIST_CAP = 500;

  constructor(
    @Inject(GATE_QUERY_REPOSITORY)
    private readonly gates: GateQueryRepository,
  ) {}

  async execute(input: GetGatesListInput): Promise<GateListRow[]> {
    if (!GATE_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('FORBIDDEN_GATE');
    }

    const page = await this.gates.listGates({
      page: 1,
      pageSize: GetGatesListUseCase.LIST_CAP,
    });
    return page.items;
  }
}
