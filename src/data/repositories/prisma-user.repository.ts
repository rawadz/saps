import { Injectable } from '@nestjs/common';
import { User as PrismaUser } from '@prisma/client';
import { UserRole } from '../../domain/auth/role';
import { User } from '../../domain/entities/user.entity';
import {
  CreateUserData,
  UserRepository,
} from '../../domain/repositories/user.repository';
import { PrismaService } from '../infrastructure/prisma.service';

/**
 * Prisma implementation of UserRepository (administrative accounts). All access
 * goes through the generated, parameterized client — no string-built SQL.
 */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async create(data: CreateUserData): Promise<{ id: string }> {
    const created = await this.prisma.user.create({
      data: {
        username: data.username,
        role: data.role,
        passwordHash: data.passwordHash,
        fullName: data.fullName ?? null,
        employeeId: data.employeeId ?? null,
        isAccountActivated: false, // must be activated by an authorized role
        mustChangePassword: true, // forced change on first login
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async updatePassword(id: string, newPasswordHash: string): Promise<void> {
    // Setting a new password also clears the forced-change flag, atomically.
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: newPasswordHash, mustChangePassword: false },
    });
  }

  async setActivated(id: string, activated: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { isAccountActivated: activated },
    });
  }

  countActiveByRole(role: UserRole): Promise<number> {
    return this.prisma.user.count({
      where: { role, isAccountActivated: true },
    });
  }

  private toDomain(row: PrismaUser): User {
    return new User(
      row.id,
      row.username,
      row.role as UserRole,
      row.passwordHash,
      row.isAccountActivated,
      row.mustChangePassword,
      row.fullName ?? undefined,
      row.employeeId ?? undefined,
    );
  }
}
