import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { VehiclePermit } from '../entities/vehicle-permit.entity';
import {
  VehiclePermitRepository,
  VEHICLE_PERMIT_REPOSITORY,
} from '../repositories/vehicle-permit.repository';

/**
 * Read a vehicle permit by its internal id.
 */
@Injectable()
export class GetVehiclePermitUseCase {
  constructor(
    @Inject(VEHICLE_PERMIT_REPOSITORY)
    private readonly vehiclePermits: VehiclePermitRepository,
  ) {}

  async execute(id: string): Promise<VehiclePermit> {
    const permit = await this.vehiclePermits.findById(id);
    if (!permit) {
      throw new NotFoundException('VEHICLE_PERMIT_NOT_FOUND');
    }
    return permit;
  }
}
