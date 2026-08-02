import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../../domain/auth/role';
import {
  UserListFilter,
  UserListPage,
  UserListRow,
  UserQueryRepository,
} from '../../domain/repositories/user-query.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of the read-only administrative-user directory query.
 *
 * SECURITY:
 *  - The SELECT is field-scoped to SAFE columns. `password_hash` is NEVER selected,
 *    so it can never leak through this read path. The internal employee link is also
 *    not returned.
 *  - Filters use Prisma's typed query builder (parameterized, never concatenated).
 */
@Injectable()
export class PrismaUserQueryRepository implements UserQueryRepository {
  private readonly logger = new Logger(PrismaUserQueryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async listUsers(filter: UserListFilter): Promise<UserListPage> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.pageSize;

    try {
      const [rows, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' }, // newest first
          skip,
          take: filter.pageSize,
          // Explicit allowlist of SAFE columns — password_hash is never read.
          select: {
            id: true,
            username: true,
            role: true,
            fullName: true,
            isAccountActivated: true,
            mustChangePassword: true,
            createdAt: true,
          },
        }),
        this.prisma.user.count({ where }),
      ]);

      const items: UserListRow[] = rows.map((r) => ({
        id: r.id,
        username: r.username,
        role: r.role as UserRole,
        fullName: r.fullName,
        isAccountActivated: r.isAccountActivated,
        mustChangePassword: r.mustChangePassword,
        createdAt: r.createdAt,
      }));

      return { items, page: filter.page, pageSize: filter.pageSize, total };
    } catch (err) {
      this.logger.error(`User list query failed: ${(err as Error).message}`);
      throw err;
    }
  }

  private buildWhere(filter: UserListFilter): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (filter.role) where.role = filter.role;
    if (filter.usernameQuery) {
      // Plain (non-encrypted) column; case-insensitive substring match.
      where.username = { contains: filter.usernameQuery, mode: 'insensitive' };
    }

    return where;
  }
}
