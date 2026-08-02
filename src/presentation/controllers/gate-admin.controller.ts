import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../domain/auth/role';
import { Gate } from '../../domain/entities/gate.entity';
import { GateListRow } from '../../domain/repositories/gate-query.repository';
import { CreateGateUseCase } from '../../domain/use-cases/create-gate.use-case';
import { GetGateUseCase } from '../../domain/use-cases/get-gate.use-case';
import { GetGatesListUseCase } from '../../domain/use-cases/get-gates-list.use-case';
import { UpdateGateUseCase } from '../../domain/use-cases/update-gate.use-case';
import { Roles } from '../decorators/roles.decorator';
import { CreateGateDto } from '../dto/create-gate.dto';
import { UpdateGateDto } from '../dto/update-gate.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Gate administration (create / list / detail / update) on /gates. Restricted to
 * leadership roles; the use-cases re-check the acting role (defense in depth).
 *
 * Named GateAdminController to avoid confusion with GateController, which serves the
 * separate /gate/scan barcode-verification flow.
 */
@Controller('gates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'department_manager', 'branch_head')
export class GateAdminController {
  constructor(
    private readonly createGate: CreateGateUseCase,
    private readonly getGatesList: GetGatesListUseCase,
    private readonly getGate: GetGateUseCase,
    private readonly updateGate: UpdateGateUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createHandler(
    @Body() dto: CreateGateDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<Gate> {
    return this.createGate.execute({
      actingRole: req.user.role as Role,
      createdBy: req.user.sub,
      name: dto.name,
      direction: dto.direction,
      supportsVehicles: dto.supportsVehicles,
      isActive: dto.isActive,
    });
  }

  @Get()
  listHandler(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<GateListRow[]> {
    return this.getGatesList.execute({ actingRole: req.user.role as Role });
  }

  @Get(':id')
  getHandler(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<Gate> {
    return this.getGate.execute({ actingRole: req.user.role as Role, id });
  }

  @Patch(':id')
  updateHandler(
    @Param('id') id: string,
    @Body() dto: UpdateGateDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<Gate> {
    return this.updateGate.execute({
      actingRole: req.user.role as Role,
      id,
      data: dto,
    });
  }
}
