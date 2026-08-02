import { IsUUID } from 'class-validator';

/** Input for PUT /gate/my-gate — the gate the guard stations at (the use-case
 *  additionally verifies it exists and is active). */
export class SetGuardGateDto {
  @IsUUID('4')
  readonly gateId!: string;
}
