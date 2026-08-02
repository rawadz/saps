import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GATE_ACCESS_ENFORCED,
  GATE_ACCESS_STRICT,
} from '../../domain/repositories/gate-access.repository';
import { BARCODE_SERVICE } from '../../domain/services/barcode.service';
import { GetMyGateUseCase } from '../../domain/use-cases/get-my-gate.use-case';
import { ListGatesForGuardUseCase } from '../../domain/use-cases/list-gates-for-guard.use-case';
import { ProcessGateScanUseCase } from '../../domain/use-cases/process-gate-scan.use-case';
import { SetGuardGateUseCase } from '../../domain/use-cases/set-guard-gate.use-case';
import { HmacBarcodeService } from '../../data/infrastructure/barcode.service';
import { GateController } from '../controllers/gate.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Composition root for the gate feature. EMPLOYEE_REPOSITORY, BAN_LIST_CACHE and
 * AUDIT_LOGGER come from the global InfrastructureModule; only the feature-specific
 * BARCODE_SERVICE binding and the use-case/guards live here.
 */
@Module({
  controllers: [GateController],
  providers: [
    ProcessGateScanUseCase,
    ListGatesForGuardUseCase,
    SetGuardGateUseCase,
    GetMyGateUseCase,
    JwtAuthGuard,
    RolesGuard,
    { provide: BARCODE_SERVICE, useClass: HmacBarcodeService },
    {
      // Reads the gate-access enforcement flag and hands the use-case a plain boolean,
      // so the Domain depends on a value (not ConfigService). Same useFactory +
      // inject:[ConfigService] pattern as the JwtModule in InfrastructureModule.
      provide: GATE_ACCESS_ENFORCED,
      useFactory: (config: ConfigService) =>
        config.get<boolean>('features.gateAccessEnforced') ?? false,
      inject: [ConfigService],
    },
    {
      // Strict sub-mode flag — same value-injection pattern as GATE_ACCESS_ENFORCED
      // above. Registered now but inert until the decision branch consumes it (step 1b).
      provide: GATE_ACCESS_STRICT,
      useFactory: (config: ConfigService) =>
        config.get<boolean>('features.gateAccessStrict') ?? false,
      inject: [ConfigService],
    },
  ],
})
export class GateModule {}
