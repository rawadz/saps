import { Module } from '@nestjs/common';
import { BARCODE_SERVICE } from '../../domain/services/barcode.service';
import { CreateVisitorPermitUseCase } from '../../domain/use-cases/create-visitor-permit.use-case';
import { GetVisitorPermitUseCase } from '../../domain/use-cases/get-visitor-permit.use-case';
import { GetVisitorPermitsListUseCase } from '../../domain/use-cases/get-visitor-permits-list.use-case';
import { HmacBarcodeService } from '../../data/infrastructure/barcode.service';
import { PermitsController } from '../controllers/permits.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Visitor-permit feature module (create + read). PERMIT_REPOSITORY comes from the
 * global InfrastructureModule; BARCODE_SERVICE is bound here (same pattern as
 * GateModule) so the create use-case can sign the permit token.
 */
@Module({
  controllers: [PermitsController],
  providers: [
    CreateVisitorPermitUseCase,
    GetVisitorPermitUseCase,
    GetVisitorPermitsListUseCase,
    JwtAuthGuard,
    RolesGuard,
    { provide: BARCODE_SERVICE, useClass: HmacBarcodeService },
  ],
})
export class PermitsModule {}
