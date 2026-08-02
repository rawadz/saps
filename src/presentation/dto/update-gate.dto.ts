import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { GateDirection } from '../../domain/entities/gate.entity';

export class UpdateGateDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly name?: string;

  @IsOptional()
  @IsIn(['in', 'out', 'both'])
  readonly direction?: GateDirection;

  @IsOptional()
  @IsBoolean()
  readonly supportsVehicles?: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
