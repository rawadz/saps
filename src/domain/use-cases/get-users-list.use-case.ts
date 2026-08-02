import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role, UserRole } from '../auth/role';
import {
  UserListPage,
  UserQueryRepository,
  USER_QUERY_REPOSITORY,
} from '../repositories/user-query.repository';

export interface GetUsersListInput {
  actingRole: Role;
  role?: UserRole;
  usernameQuery?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Read a paginated, optionally-filtered administrative-user directory.
 *
 * User management is sensitive, so this is restricted to super_admin,
 * department_manager and branch_head — here in the use-case (defense in depth) as well as by the
 * controller's @Roles (which overrides the broader class-level roles). The page size
 * is clamped to a hard
 * maximum, and the repository returns SAFE fields only (never the password hash).
 */
@Injectable()
export class GetUsersListUseCase {
  static readonly MAX_PAGE_SIZE = 50;
  static readonly DEFAULT_PAGE_SIZE = 20;

  constructor(
    @Inject(USER_QUERY_REPOSITORY)
    private readonly users: UserQueryRepository,
  ) {}

  async execute(input: GetUsersListInput): Promise<UserListPage> {
    if (
      input.actingRole !== 'super_admin' &&
      input.actingRole !== 'department_manager' &&
      input.actingRole !== 'branch_head'
    ) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_LIST_USERS');
    }

    return this.users.listUsers({
      role: input.role,
      // A blank/whitespace query is treated as "no filter", not an empty match.
      usernameQuery: input.usernameQuery?.trim() || undefined,
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
      return GetUsersListUseCase.DEFAULT_PAGE_SIZE;
    }
    const floored = Math.floor(pageSize);
    if (floored < 1) return 1;
    return Math.min(floored, GetUsersListUseCase.MAX_PAGE_SIZE);
  }
}
