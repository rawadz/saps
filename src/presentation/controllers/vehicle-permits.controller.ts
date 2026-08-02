import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../domain/auth/role';
import { VehiclePermit } from '../../domain/entities/vehicle-permit.entity';
import { VehiclePermitListPage } from '../../domain/repositories/vehicle-permit-query.repository';
import { CreateVehiclePermitUseCase } from '../../domain/use-cases/create-vehicle-permit.use-case';
import { GetVehiclePermitUseCase } from '../../domain/use-cases/get-vehicle-permit.use-case';
import { GetVehiclePermitsListUseCase } from '../../domain/use-cases/get-vehicle-permits-list.use-case';
import { Roles } from '../decorators/roles.decorator';
import { CreateVehiclePermitDto } from '../dto/create-vehicle-permit.dto';
import { VehiclePermitsQueryDto } from '../dto/vehicle-permits-query.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Vehicle permit issuance + lookup. Restricted to the permit-managing roles; the
 * use-case enforces the "exactly one owner" rule and verifies the owner exists.
 */
@Controller('vehicle-permits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'permit_officer', 'branch_head', 'supervisor')
export class VehiclePermitsController {
  constructor(
    private readonly createVehiclePermit: CreateVehiclePermitUseCase,
    private readonly getVehiclePermit: GetVehiclePermitUseCase,
    private readonly getVehiclePermitsList: GetVehiclePermitsListUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createHandler(
    @Body() dto: CreateVehiclePermitDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ id: string; barcodeToken: string }> {
    return this.createVehiclePermit.execute({
      actingRole: req.user.role as Role,
      plateNumber: dto.plateNumber,
      vehicleType: dto.vehicleType,
      color: dto.color,
      make: dto.make,
      model: dto.model,
      expiresAt: dto.expiresAt,
      ownerEmployeeSelfId: dto.ownerEmployeeSelfId,
      ownerVisitorPermitNumber: dto.ownerVisitorPermitNumber,
    });
  }

  // Paginated, read-only vehicle-permit directory. The class-level @Roles already
  // limits this to the permit roles; the use-case re-checks (defense in depth) and
  // clamps the page size.
  @Get()
  listHandler(
    @Query() query: VehiclePermitsQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<VehiclePermitListPage> {
    return this.getVehiclePermitsList.execute({
      actingRole: req.user.role as Role,
      status: query.status,
      vehicleType: query.vehicleType,
      plateQuery: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  getHandler(@Param('id', ParseUUIDPipe) id: string): Promise<VehiclePermit> {
    return this.getVehiclePermit.execute(id);
  }
}
