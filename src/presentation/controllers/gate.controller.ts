import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../domain/auth/role';
import { GetMyGateUseCase } from '../../domain/use-cases/get-my-gate.use-case';
import { ListGatesForGuardUseCase } from '../../domain/use-cases/list-gates-for-guard.use-case';
import {
  ProcessGateScanUseCase,
  ScanDecision,
} from '../../domain/use-cases/process-gate-scan.use-case';
import { SetGuardGateUseCase } from '../../domain/use-cases/set-guard-gate.use-case';
import { Roles } from '../decorators/roles.decorator';
import { ScanBarcodeDto } from '../dto/scan-barcode.dto';
import { SetGuardGateDto } from '../dto/set-guard-gate.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Gate scan endpoint. The controller is thin: it validates input, enforces that
 * the OPERATOR is an authorized gate role, and delegates the whole decision (verify
 * + ban check + live status + audit write) to the single-request use-case.
 *
 * Always returns HTTP 200 with a GREEN/RED decision — a rejected scan is a valid
 * result, not an HTTP error. The guard's identity is taken from the verified token.
 */
@Controller('gate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('guard', 'supervisor', 'branch_head', 'super_admin')
export class GateController {
  constructor(
    private readonly processGateScan: ProcessGateScanUseCase,
    private readonly listGatesForGuardUseCase: ListGatesForGuardUseCase,
    private readonly setGuardGateUseCase: SetGuardGateUseCase,
    private readonly getMyGateUseCase: GetMyGateUseCase,
  ) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  scan(
    @Body() dto: ScanBarcodeDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<ScanDecision> {
    return this.processGateScan.execute(dto.barcode, req.user.sub);
  }

  // List the active gates a guard may pick as their station. Path: /gate/gates —
  // under the singular /gate prefix, so it never collides with the admin /gates
  // routes (GateAdminController). The class-level @Roles already restricts this to
  // the four gate-operating roles; the use-case re-checks (defense in depth).
  @Get('gates')
  listGatesForGuardHandler(
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    return this.listGatesForGuardUseCase.execute({
      actingRole: req.user.role as Role,
    });
  }

  // Read the guard's currently-bound station gate, or null if none is bound. Path:
  // /gate/my-gate (GET). A deactivated bound gate is still returned (isActive=false).
  @Get('my-gate')
  getMyGateHandler(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.getMyGateUseCase.execute({
      actingRole: req.user.role as Role,
      guardUserId: req.user.sub,
    });
  }

  // Bind the calling guard's current station gate (stored in their session). Path:
  // /gate/my-gate. The use-case verifies the gate exists AND is active.
  @Put('my-gate')
  @HttpCode(HttpStatus.OK)
  async setMyGateHandler(
    @Body() dto: SetGuardGateDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    await this.setGuardGateUseCase.execute({
      actingRole: req.user.role as Role,
      guardUserId: req.user.sub,
      gateId: dto.gateId,
    });
    return { success: true };
  }
}
