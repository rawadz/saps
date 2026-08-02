import { ForbiddenException } from '@nestjs/common';
import {
  VehiclePermitListFilter,
  VehiclePermitListPage,
  VehiclePermitListRow,
  VehiclePermitQueryRepository,
} from '../repositories/vehicle-permit-query.repository';
import { GetVehiclePermitsListUseCase } from './get-vehicle-permits-list.use-case';

class FakeVehiclePermitQuery implements VehiclePermitQueryRepository {
  public lastFilter?: VehiclePermitListFilter;
  public callCount = 0;
  constructor(
    private readonly rows: VehiclePermitListRow[] = [],
    private readonly total = 0,
  ) {}
  listVehiclePermits(
    filter: VehiclePermitListFilter,
  ): Promise<VehiclePermitListPage> {
    this.lastFilter = filter;
    this.callCount += 1;
    return Promise.resolve({
      items: this.rows,
      page: filter.page,
      pageSize: filter.pageSize,
      total: this.total,
    });
  }
}

function row(overrides: Partial<VehiclePermitListRow> = {}): VehiclePermitListRow {
  return {
    id: 'veh-1',
    plateNumber: 'ABC-1234',
    vehicleType: 'private',
    status: 'active',
    color: null,
    make: null,
    model: null,
    ownerType: 'employee',
    ownerName: 'Owner Name',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GetVehiclePermitsListUseCase', () => {
  // ── Authorization ──────────────────────────────────────────────────────────
  it('forbids hr (may manage employees but not vehicle permits)', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await expect(uc.execute({ actingRole: 'hr' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(repo.callCount).toBe(0)
  });

  it('forbids a guard', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await expect(uc.execute({ actingRole: 'guard' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(repo.callCount).toBe(0)
  });

  it.each(['super_admin', 'permit_officer', 'branch_head', 'supervisor'] as const)(
    'allows %s to list',
    async (role) => {
      const repo = new FakeVehiclePermitQuery([row()], 1);
      const uc = new GetVehiclePermitsListUseCase(repo);
      const res = await uc.execute({ actingRole: role });
      expect(repo.callCount).toBe(1);
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
    },
  );

  // ── Pagination clamping ────────────────────────────────────────────────────
  it('defaults page=1 and pageSize=20 when omitted', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer' });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(
      GetVehiclePermitsListUseCase.DEFAULT_PAGE_SIZE,
    );
  });

  it('clamps pageSize to the hard maximum of 50', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', pageSize: 999 });
    expect(repo.lastFilter?.pageSize).toBe(
      GetVehiclePermitsListUseCase.MAX_PAGE_SIZE,
    );
  });

  it('normalizes a zero/negative page to 1 and a sub-1 pageSize to 1', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', page: 0, pageSize: 0 });
    expect(repo.lastFilter?.page).toBe(1);
    expect(repo.lastFilter?.pageSize).toBe(1);
  });

  // ── Filters ────────────────────────────────────────────────────────────────
  it('passes the status filter through (trimmed)', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', status: '  active  ' });
    expect(repo.lastFilter?.status).toBe('active');
  });

  it('passes the vehicleType filter through', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', vehicleType: 'government' });
    expect(repo.lastFilter?.vehicleType).toBe('government');
  });

  it('trims the plate query and drops a whitespace-only query', async () => {
    const repo = new FakeVehiclePermitQuery();
    const uc = new GetVehiclePermitsListUseCase(repo);
    await uc.execute({ actingRole: 'permit_officer', plateQuery: '  ABC  ' });
    expect(repo.lastFilter?.plateQuery).toBe('ABC');

    const repo2 = new FakeVehiclePermitQuery();
    const uc2 = new GetVehiclePermitsListUseCase(repo2);
    await uc2.execute({ actingRole: 'permit_officer', plateQuery: '   ' });
    expect(repo2.lastFilter?.plateQuery).toBeUndefined();
  });

  // ── Owner name (join) pass-through + safe shape ────────────────────────────
  it('preserves the joined ownerType and ownerName from the repository', async () => {
    const repo = new FakeVehiclePermitQuery(
      [row({ ownerType: 'visitor', ownerName: 'Visitor X' })],
      1,
    );
    const uc = new GetVehiclePermitsListUseCase(repo);
    const res = await uc.execute({ actingRole: 'permit_officer' });
    expect(res.items[0].ownerType).toBe('visitor');
    expect(res.items[0].ownerName).toBe('Visitor X');
  });

  it('returns only the safe fields (no barcodeToken, no internal owner UUIDs)', async () => {
    const repo = new FakeVehiclePermitQuery([row()], 1);
    const uc = new GetVehiclePermitsListUseCase(repo);
    const res = await uc.execute({ actingRole: 'permit_officer' });
    expect(Object.keys(res.items[0]).sort()).toEqual(
      [
        'color',
        'createdAt',
        'id',
        'make',
        'model',
        'ownerName',
        'ownerType',
        'plateNumber',
        'status',
        'vehicleType',
      ].sort(),
    );
  });
});
