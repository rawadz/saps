import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../domain/auth/role';
import { Permit } from '../../domain/entities/permit.entity';
import { PermitListPage } from '../../domain/repositories/permit-query.repository';
import { CreateVisitorPermitUseCase } from '../../domain/use-cases/create-visitor-permit.use-case';
import { GetVisitorPermitUseCase } from '../../domain/use-cases/get-visitor-permit.use-case';
import { GetVisitorPermitsListUseCase } from '../../domain/use-cases/get-visitor-permits-list.use-case';
import { Roles } from '../decorators/roles.decorator';
import { CreateVisitorPermitDto } from '../dto/create-permit.dto';
import { PermitsQueryDto } from '../dto/permits-query.dto';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * Visitor permit issuance + lookup. Restricted to permit-issuing roles; reading is
 * limited to the same roles because the response exposes the (decrypted) visitor id.
 * The use-case re-checks the acting role (defense in depth).
 */
@Controller('permits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'permit_officer', 'branch_head', 'supervisor')
export class PermitsController {
  constructor(
    private readonly createPermit: CreateVisitorPermitUseCase,
    private readonly getPermit: GetVisitorPermitUseCase,
    private readonly getPermitsList: GetVisitorPermitsListUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createHandler(
    @Body() dto: CreateVisitorPermitDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ permitNumber: string; token: string }> {
    return this.createPermit.execute({
      actingRole: req.user.role as Role,
      issuedBy: req.user.sub,
      permitType: dto.permitType,
      visitorName: dto.visitorName,
      idOrPhone: dto.idOrPhone,
      personnelType: dto.personnelType,
      host: dto.host,
      reason: dto.reason,
      startDate: dto.startDate,
      endDate: dto.endDate,
      allowedDays: dto.allowedDays,
      allowedTimeFrom: dto.allowedTimeFrom,
      allowedTimeTo: dto.allowedTimeTo,
    });
  }

  // Paginated, read-only visitor-permit directory. The class-level @Roles already
  // limits this to the permit roles; the use-case re-checks (defense in depth) and
  // clamps the page size.
  @Get()
  listHandler(
    @Query() query: PermitsQueryDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<PermitListPage> {
    return this.getPermitsList.execute({
      actingRole: req.user.role as Role,
      status: query.status,
      permitType: query.permitType,
      nameQuery: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':permitNumber')
  getHandler(@Param('permitNumber') permitNumber: string): Promise<Permit> {
    return this.getPermit.execute(permitNumber);
  }
}
