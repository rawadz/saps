import { Module } from '@nestjs/common';
import { BARCODE_SERVICE } from '../../domain/services/barcode.service';
import { CreateVehiclePermitUseCase } from '../../domain/use-cases/create-vehicle-permit.use-case';
import { GetVehiclePermitUseCase } from '../../domain/use-cases/get-vehicle-permit.use-case';
import { GetVehiclePermitsListUseCase } from '../../domain/use-cases/get-vehicle-permits-list.use-case';
import { HmacBarcodeService } from '../../data/infrastructure/barcode.service';
import { VehiclePermitsController } from '../controllers/vehicle-permits.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Vehicle-permit feature module (create + read). VEHICLE_PERMIT_REPOSITORY comes
 * from the global InfrastructureModule; BARCODE_SERVICE is bound here (same pattern
 * as GateModule/PermitsModule) so the create use-case can sign the vehicle token.
 */
@Module({
  controllers: [VehiclePermitsController],
  providers: [
    CreateVehiclePermitUseCase,
    GetVehiclePermitUseCase,
    GetVehiclePermitsListUseCase,
    JwtAuthGuard,
    RolesGuard,
    { provide: BARCODE_SERVICE, useClass: HmacBarcodeService },
  ],
})
export class VehiclePermitsModule {}
