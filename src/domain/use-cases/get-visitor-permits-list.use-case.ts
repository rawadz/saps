import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import { PermitStatus, PermitType } from '../entities/permit.entity';
import {
  PermitListPage,
  PermitQueryRepository,
  PERMIT_QUERY_REPOSITORY,
} from '../repositories/permit-query.repository';

// The roles that may issue/read visitor permits (mirrors the controller's @Roles and
// CreateVisitorPermitUseCase's PERMIT_ISSUER_ROLES). HR is NOT among them.
const PERMIT_VIEW_ROLES: Role[] = [
  'super_admin',
  'permit_officer',
  'branch_head',
  'supervisor',
];

export interface GetVisitorPermitsListInput {
  actingRole: Role;
  status?: PermitStatus;
  permitType?: PermitType;
  nameQuery?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Read a paginated, optionally-filtered visitor-permit directory.
 *
 * Authorization is enforced HERE as well as by the controller's RolesGuard (defense
 * in depth). The page size is clamped to a hard maximum so a listing can never dump
 * the whole table. The repository returns SAFE fields only (no idOrPhone, no token).
 */
@Injectable()
export class GetVisitorPermitsListUseCase {
  static readonly MAX_PAGE_SIZE = 50;
  static readonly DEFAULT_PAGE_SIZE = 20;

  constructor(
    @Inject(PERMIT_QUERY_REPOSITORY)
    private readonly permits: PermitQueryRepository,
  ) {}

  async execute(input: GetVisitorPermitsListInput): Promise<PermitListPage> {
    if (!PERMIT_VIEW_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_LIST_PERMITS');
    }

    return this.permits.listPermits({
      status: input.status,
      permitType: input.permitType,
      // A blank/whitespace query is treated as "no filter", not an empty match.
      nameQuery: input.nameQuery?.trim() || undefined,
      page: this.normalizePage(input.page),
      pageSize: this.normalizePageSize(input.pageSize),
    });
  }

  private normalizePage(page?: number): number {
    if (page === undefined || !Number.isFinite(page)) return 1;
    return Math.max(1, Math.floor(page));
  }

  private normalizePageSize(pageSize?: number): number {
    if (pageSize === undefined || !Number.isFinite(pageSize)) {
      return GetVisitorPermitsListUseCase.DEFAULT_PAGE_SIZE;
    }
    const floored = Math.floor(pageSize);
    if (floored < 1) return 1;
    return Math.min(floored, GetVisitorPermitsListUseCase.MAX_PAGE_SIZE);
  }
}
