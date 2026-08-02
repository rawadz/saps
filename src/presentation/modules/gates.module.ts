import { Module } from '@nestjs/common';
import { CreateGateUseCase } from '../../domain/use-cases/create-gate.use-case';
import { GetGateUseCase } from '../../domain/use-cases/get-gate.use-case';
import { GetGatesListUseCase } from '../../domain/use-cases/get-gates-list.use-case';
import { UpdateGateUseCase } from '../../domain/use-cases/update-gate.use-case';
import { GateAdminController } from '../controllers/gate-admin.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Gate administration module (create / list / get / update). GATE_REPOSITORY and
 * GATE_QUERY_REPOSITORY come from the global InfrastructureModule, so they are not
 * re-bound here (same pattern as PermitsModule).
 *
 * Distinct from GateModule, which serves the /gate/scan barcode-verification flow.
 */
@Module({
  controllers: [GateAdminController],
  providers: [
    CreateGateUseCase,
    GetGatesListUseCase,
    GetGateUseCase,
    UpdateGateUseCase,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class GatesModule {}
