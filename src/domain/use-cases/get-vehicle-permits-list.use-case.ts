import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '../auth/role';
import { VehicleType } from '../entities/vehicle-permit.entity';
import {
  VehiclePermitListPage,
  VehiclePermitQueryRepository,
  VEHICLE_PERMIT_QUERY_REPOSITORY,
} from '../repositories/vehicle-permit-query.repository';

// The roles that may issue/read vehicle permits (mirrors the controller's @Roles and
// CreateVehiclePermitUseCase's VEHICLE_PERMIT_ROLES). HR is NOT among them.
const VEHICLE_PERMIT_VIEW_ROLES: Role[] = [
  'super_admin',
  'permit_officer',
  'branch_head',
  'supervisor',
];

export interface GetVehiclePermitsListInput {
  actingRole: Role;
  status?: string;
  vehicleType?: VehicleType;
  plateQuery?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Read a paginated, optionally-filtered vehicle-permit directory.
 *
 * Authorization is enforced HERE as well as by the controller's RolesGuard (defense
 * in depth). The page size is clamped to a hard maximum so a listing can never dump
 * the whole table. The repository returns SAFE fields only (no barcodeToken, no
 * internal owner UUIDs); the owner NAME is joined from plain name columns.
 */
@Injectable()
export class GetVehiclePermitsListUseCase {
  static readonly MAX_PAGE_SIZE = 50;
  static readonly DEFAULT_PAGE_SIZE = 20;

  constructor(
    @Inject(VEHICLE_PERMIT_QUERY_REPOSITORY)
    private readonly vehiclePermits: VehiclePermitQueryRepository,
  ) {}

  async execute(
    input: GetVehiclePermitsListInput,
  ): Promise<VehiclePermitListPage> {
    if (!VEHICLE_PERMIT_VIEW_ROLES.includes(input.actingRole)) {
      throw new ForbiddenException('NOT_AUTHORIZED_TO_LIST_VEHICLE_PERMITS');
    }

    return this.vehiclePermits.listVehiclePermits({
      // Blank/whitespace filters are treated as "no filter", not an empty match.
      status: input.status?.trim() || undefined,
      vehicleType: input.vehicleType,
      plateQuery: input.plateQuery?.trim() || undefined,
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
      return GetVehiclePermitsListUseCase.DEFAULT_PAGE_SIZE;
    }
    const floored = Math.floor(pageSize);
    if (floored < 1) return 1;
    return Math.min(floored, GetVehiclePermitsListUseCase.MAX_PAGE_SIZE);
  }
}
