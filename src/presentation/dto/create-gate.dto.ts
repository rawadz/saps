import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { GateDirection } from '../../domain/entities/gate.entity';

export class CreateGateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100) // bound the human name (matches the column's practical limit)
  readonly name!: string;

  @IsIn(['in', 'out', 'both'])
  readonly direction!: GateDirection;

  @IsBoolean()
  readonly supportsVehicles!: boolean;

  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}
