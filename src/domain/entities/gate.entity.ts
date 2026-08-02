/**
 * Domain entity for an administration gate (entry/exit point).
 * Pure TypeScript — no NestJS decorators, no Prisma types.
 */

// Mirror of the Prisma GateDirection enum. Defined here so the Domain layer
// has zero imports from @prisma/client.
export type GateDirection = 'in' | 'out' | 'both';

export class Gate {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly direction: GateDirection,
    public readonly supportsVehicles: boolean,
    public readonly isActive: boolean,
    public readonly createdBy: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
