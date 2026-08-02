import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { EmployeeProfile } from '../../domain/repositories/employee.repository';
import { GetEmployeeSelfViewUseCase } from '../../domain/use-cases/get-employee-self-view.use-case';
import { Roles } from '../decorators/roles.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/**
 * The employee's self-service view. Restricted to the `employee` role; the self
 * id is always taken from the verified token (`sub`), so an employee can only
 * read their OWN profile and barcode — never anyone else's.
 */
@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('employee')
export class MeController {
  constructor(private readonly selfView: GetEmployeeSelfViewUseCase) {}

  @Get('profile')
  profile(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<EmployeeProfile> {
    return this.selfView.execute(req.user.sub);
  }

  @Get('barcode')
  async barcode(
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<{ barcode: string | null }> {
    const profile = await this.selfView.execute(req.user.sub);
    return { barcode: profile.barcodeToken };
  }
}
