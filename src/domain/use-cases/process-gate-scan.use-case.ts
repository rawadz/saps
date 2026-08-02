import { Inject, Injectable } from '@nestjs/common';
import { Employee } from '../entities/employee.entity';
import { Permit } from '../entities/permit.entity';
import { VehiclePermit } from '../entities/vehicle-permit.entity';
import {
  EmployeeRepository,
  EMPLOYEE_REPOSITORY,
} from '../repositories/employee.repository';
import {
  GateRepository,
  GATE_REPOSITORY,
} from '../repositories/gate.repository';
import {
  GateAccessRepository,
  GATE_ACCESS_REPOSITORY,
  GATE_ACCESS_ENFORCED,
  GATE_ACCESS_STRICT,
} from '../repositories/gate-access.repository';
import {
  PermitRepository,
  PERMIT_REPOSITORY,
} from '../repositories/permit.repository';
import {
  VehiclePermitRepository,
  VEHICLE_PERMIT_REPOSITORY,
} from '../repositories/vehicle-permit.repository';
import { AuditLogger, AUDIT_LOGGER } from '../services/audit.logger';
import { BanListCache, BAN_LIST_CACHE } from '../services/ban-list.cache';
import { BarcodeService, BARCODE_SERVICE } from '../services/barcode.service';
import {
  GuardGateService,
  GUARD_GATE_SERVICE,
} from '../services/guard-gate.service';

// ── Guard-facing display blocks ──────────────────────────────────────────────
// SAFE fields ONLY. These shapes are built by the explicit mappers below, which
// deliberately reference NONE of the sensitive fields the domain entities carry
// (employee self id, permit idOrPhone, permit/vehicle tokens). The information is
// for the guard's visual verification of the person/vehicle at the gate.

export interface EmployeeScanInfo {
  kind: 'employee';
  fullName: string;
  commandDepartment: string | null;
  branch: string | null;
  priority: string | null;
  personnelType: 'civilian' | 'military';
  rank: string | null; // typically only set for military personnel
  currentJobTitle: string | null;
  // Service/employment status — shown ALWAYS (green or red) so the guard sees it.
  serviceStatus: 'active' | 'transferred' | 'discharged' | 'contract_ended';
  serviceExitDate: string | null; // ISO date of the documented exit
  serviceExitNote: string | null;
}

export interface VisitorScanInfo {
  kind: 'visitor';
  visitorName: string;
  permitType: 'scheduled' | 'single_entry';
  host: string;
  reason: string | null;
  personnelType: 'civilian' | 'military' | null;
  startDate: string | null; // ISO, scheduled permits only
  endDate: string | null;
}

export interface VehicleScanInfo {
  kind: 'vehicle';
  plateNumber: string;
  vehicleType: string | null;
  ownerType: 'employee' | 'visitor';
  owner: EmployeeScanInfo | VisitorScanInfo | null;
}

export type ScanSubject =
  | EmployeeScanInfo
  | VisitorScanInfo
  | VehicleScanInfo;

export type ScanDecision =
  | {
      result: 'GREEN';
      subjectName: string;
      department: string;
      subject: ScanSubject | null;
    }
  | { result: 'RED'; reason: string; subject: ScanSubject | null };

// ── SAFE mappers ─────────────────────────────────────────────────────────────
// SECURITY: each mapper lists EXACTLY the agreed safe fields. It must NEVER read
// e.employeeId (the self id), p.idOrPhone, p.token, or v.barcodeToken — nor any
// national id / phone / hash. Keeping these as small explicit functions makes the
// "what leaves the server" surface auditable in one place.
function employeeScanInfo(e: Employee): EmployeeScanInfo {
  return {
    kind: 'employee',
    fullName: e.fullName,
    commandDepartment: e.department || null, // entity stores '' when absent
    branch: e.branch,
    priority: e.priority,
    personnelType: e.personnelType,
    rank: e.rank,
    currentJobTitle: e.currentJobTitle,
    serviceStatus: e.serviceStatus,
    serviceExitDate: e.serviceExitDate ? e.serviceExitDate.toISOString() : null,
    serviceExitNote: e.serviceExitNote,
  };
}

function visitorScanInfo(p: Permit): VisitorScanInfo {
  return {
    kind: 'visitor',
    visitorName: p.visitorName,
    permitType: p.permitType,
    host: p.host,
    reason: p.reason,
    personnelType: p.personnelType,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    endDate: p.endDate ? p.endDate.toISOString() : null,
  };
}

function vehicleScanInfo(
  v: VehiclePermit,
  ownerType: 'employee' | 'visitor',
  owner: EmployeeScanInfo | VisitorScanInfo | null,
): VehicleScanInfo {
  return {
    kind: 'vehicle',
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    ownerType,
    owner,
  };
}

/** Which owner a vehicle is bound to (DB CHECK guarantees exactly one). */
function vehicleOwnerType(v: VehiclePermit): 'employee' | 'visitor' {
  return v.employeeId ? 'employee' : 'visitor';
}

/**
 * The security-critical gate scan: ONE request that verifies the barcode,
 * resolves live status, writes the audit record, and returns the green/red
 * decision. Order is chosen for speed and safety:
 *   1. verify the HMAC signature (no IO if the token is forged)
 *   2. check the Redis ban list FIRST (sub-millisecond) before the DB
 *   3. resolve live status from Postgres
 *   4. write the audit record in the SAME request (success or failure)
 *
 * Token routing is by a discriminator INSIDE the signed payload (verified first, so
 * it is tamper-proof): `permit:` -> visitor-permit branch, `vehicle:` -> vehicle
 * branch, everything else -> employee self id. The employee and permit paths are
 * unchanged. A vehicle has no independent "allowed" state: it is admitted only if
 * its own permit is active/unexpired AND the owner it inherits from (employee or
 * visitor permit) is currently valid — the owner's visitor permit is NEVER consumed
 * by a vehicle scan.
 *
 * Every decision (GREEN or RED) carries a SAFE `subject` block for the guard's
 * visual verification, populated whenever the underlying record exists in the DB.
 * The ban DECISION stays Redis-authoritative and fast; on a ban we additionally do a
 * single DISPLAY-only read so the guard can see who was rejected. The audit record
 * is unchanged — none of the display data is logged.
 */
@Injectable()
export class ProcessGateScanUseCase {
  constructor(
    @Inject(BARCODE_SERVICE) private readonly barcodes: BarcodeService,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(PERMIT_REPOSITORY) private readonly permits: PermitRepository,
    @Inject(VEHICLE_PERMIT_REPOSITORY)
    private readonly vehiclePermits: VehiclePermitRepository,
    @Inject(BAN_LIST_CACHE) private readonly banList: BanListCache,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(GUARD_GATE_SERVICE) private readonly guardGate: GuardGateService,
    @Inject(GATE_REPOSITORY) private readonly gates: GateRepository,
    @Inject(GATE_ACCESS_REPOSITORY)
    private readonly gateAccess: GateAccessRepository,
    @Inject(GATE_ACCESS_ENFORCED) private readonly gateAccessEnforced: boolean,
    @Inject(GATE_ACCESS_STRICT) private readonly gateAccessStrict: boolean,
  ) {}

  async execute(
    rawToken: string,
    guardUserId: string,
  ): Promise<ScanDecision> {
    // Gate identity is resolved server-side from the guard's pinned session
    // (resolvedGateName below), never from client input — so a guard cannot spoof
    // another gate in the audit trail. Graceful degradation: if the guard bound no
    // gate, or the bound gate was since deleted, the recorded name is simply null.
    // We never throw here — the accept/reject decision is entirely unaffected by gate
    // resolution. `string | undefined` (not null) matches the `gateName?: string`
    // convention used by AuditEntry and every helper below, so the resolved name
    // flows through unchanged with no contract widening.
    let resolvedGateName: string | undefined;
    const boundGateId = await this.guardGate.getGuardGate(guardUserId);
    if (boundGateId) {
      const gate = await this.gates.findById(boundGateId);
      resolvedGateName = gate ? gate.name : undefined;
    }

    // 1. Authenticate the token. A forged token never reaches the DB or cache.
    const decoded = this.barcodes.verify(rawToken);
    if (!decoded) {
      return this.deny(
        'unknown',
        'INVALID_BARCODE',
        guardUserId,
        resolvedGateName,
        boundGateId,
      );
    }

    // 1b. Visitor-permit token? The `permit:` discriminator lives INSIDE the signed
    //     payload, so it is tamper-proof; an employee self id can never contain ':'.
    if (decoded.startsWith('permit:')) {
      return this.handlePermit(
        decoded.slice('permit:'.length),
        guardUserId,
        resolvedGateName,
        boundGateId,
      );
    }

    // 1c. Vehicle token? Same tamper-proof discriminator scheme; the payload carries
    //     the vehicle's internal id, whose owner status is resolved live below.
    if (decoded.startsWith('vehicle:')) {
      return this.handleVehicle(
        decoded.slice('vehicle:'.length),
        guardUserId,
        resolvedGateName,
        boundGateId,
      );
    }

    // Otherwise the decoded payload is an employee self id.
    const selfId = decoded;

    // 2. Fast ban check from Redis before any access decision is made. The DECISION
    //    is Redis-authoritative; we then do ONE display-only read so the guard can
    //    still see the banned person's details (RED with data).
    if (await this.banList.isBanned(selfId)) {
      const banned = await this.employees.findByEmployeeId(selfId);
      return this.deny(
        selfId,
        'BANNED',
        guardUserId,
        resolvedGateName,
        boundGateId,
        banned ? employeeScanInfo(banned) : null,
      );
    }

    // 3. Resolve the CURRENT status live — the barcode carries no admin data.
    const employee = await this.employees.findByEmployeeId(selfId);
    if (!employee) {
      return this.deny(
        selfId,
        'NOT_FOUND',
        guardUserId,
        resolvedGateName,
        boundGateId,
      );
    }
    if (!employee.canEnter()) {
      // Reason priority: ban > service exit > inactive account. The subject block
      // still carries the service status + date regardless of which reason wins.
      const reason = employee.isEntryBlocked
        ? 'BANNED'
        : employee.serviceStatus !== 'active'
          ? employee.serviceStatus.toUpperCase() // TRANSFERRED / DISCHARGED / CONTRACT_ENDED
          : 'INACTIVE';
      return this.deny(
        selfId,
        reason,
        guardUserId,
        resolvedGateName,
        boundGateId,
        employeeScanInfo(employee),
      );
    }

    // Gate-authorization check (Phase 4-b): a final layer ON TOP of the general
    // canEnter eligibility — never alters any existing accept/reject path. Dormant by
    // default (the flag is false) for a staged rollout; enabled via GATE_ACCESS_ENFORCED.
    if (this.gateAccessEnforced && boundGateId) {
      const hasAny = await this.gateAccess.hasAnyGateAccess(selfId);
      // Strict (default-deny) mode: an employee with NO grants is denied outright.
      // Optional mode (default): no grant => unrestricted; only a granted employee is
      // bound to their set. The hasGateAccess check below applies to BOTH modes (when hasAny).
      if (this.gateAccessStrict && !hasAny) {
        return this.deny(
          selfId,
          'GATE_NOT_AUTHORIZED',
          guardUserId,
          resolvedGateName,
          boundGateId,
          employeeScanInfo(employee),
        );
      }
      if (hasAny && !(await this.gateAccess.hasGateAccess(selfId, boundGateId))) {
        return this.deny(
          selfId,
          'GATE_NOT_AUTHORIZED',
          guardUserId,
          resolvedGateName,
          boundGateId,
          employeeScanInfo(employee),
        );
      }
    }

    // 4. Approved — record the audit in the same request, then go green.
    await this.audit.record({
      type: 'entry_check_approved',
      subjectType: 'employee',
      subjectRef: selfId,
      actorUserId: guardUserId,
      gateName: resolvedGateName,
      gateId: boundGateId ?? undefined,
      result: 'success',
    });

    return {
      result: 'GREEN',
      subjectName: employee.fullName,
      department: employee.department,
      subject: employeeScanInfo(employee),
    };
  }

  private async deny(
    subjectRef: string,
    reason: string,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
    subject: ScanSubject | null = null,
  ): Promise<ScanDecision> {
    await this.audit.record({
      type: 'entry_check_denied',
      subjectType: 'employee',
      subjectRef,
      actorUserId: guardUserId,
      gateName,
      gateId: gateId ?? undefined,
      result: 'failure',
      reason,
    });
    return { result: 'RED', reason, subject };
  }

  // ── Visitor-permit branch ──────────────────────────────────────────────────
  private async handlePermit(
    permitNumber: string,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
  ): Promise<ScanDecision> {
    const permit = await this.permits.findByPermitNumber(permitNumber);
    if (!permit) {
      return this.denyPermit(
        permitNumber,
        'PERMIT_NOT_FOUND',
        guardUserId,
        gateName,
        gateId,
      );
    }

    // Scheduled: valid only inside its window. Multi-use, so no consumption.
    if (permit.permitType === 'scheduled') {
      const validity = permit.isValidScheduledAt(new Date());
      return validity.ok
        ? this.approvePermit(permit, guardUserId, gateName, gateId)
        : this.denyPermit(
            permitNumber,
            validity.reason,
            guardUserId,
            gateName,
            gateId,
            visitorScanInfo(permit),
          );
    }

    // Single-entry: must be active (not used/expired/cancelled), then consumed once.
    if (permit.status !== 'active') {
      const reason =
        permit.status === 'used'
          ? 'ALREADY_USED'
          : permit.status === 'expired'
            ? 'EXPIRED'
            : 'CANCELLED';
      return this.denyPermit(
        permitNumber,
        reason,
        guardUserId,
        gateName,
        gateId,
        visitorScanInfo(permit),
      );
    }
    if (permit.expiresAt && new Date() > permit.expiresAt) {
      return this.denyPermit(
        permitNumber,
        'EXPIRED',
        guardUserId,
        gateName,
        gateId,
        visitorScanInfo(permit),
      );
    }

    const consumed = await this.permits.consumeSingleEntry(permitNumber);
    if (!consumed) {
      // Lost a race to a concurrent scan — the conditional update flipped 0 rows.
      return this.denyPermit(
        permitNumber,
        'ALREADY_USED',
        guardUserId,
        gateName,
        gateId,
        visitorScanInfo(permit),
      );
    }
    return this.approvePermit(permit, guardUserId, gateName, gateId);
  }

  private async approvePermit(
    permit: Permit,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
  ): Promise<ScanDecision> {
    await this.audit.record({
      type: 'entry_check_approved',
      subjectType: 'permit',
      subjectRef: permit.permitNumber,
      actorUserId: guardUserId,
      gateName,
      gateId: gateId ?? undefined,
      result: 'success',
    });
    return {
      result: 'GREEN',
      subjectName: permit.visitorName,
      department: permit.host,
      subject: visitorScanInfo(permit),
    };
  }

  private async denyPermit(
    permitNumber: string,
    reason: string,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
    subject: ScanSubject | null = null,
  ): Promise<ScanDecision> {
    await this.audit.record({
      type: 'entry_check_denied',
      subjectType: 'permit',
      subjectRef: permitNumber,
      actorUserId: guardUserId,
      gateName,
      gateId: gateId ?? undefined,
      result: 'failure',
      reason,
    });
    return { result: 'RED', reason, subject };
  }

  // ── Vehicle branch: strict owner-status inheritance, NO permit consumption ──
  private async handleVehicle(
    vehicleId: string,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
  ): Promise<ScanDecision> {
    const vehicle = await this.vehiclePermits.findById(vehicleId);
    if (!vehicle) {
      return this.denyVehicle(
        vehicleId,
        'VEHICLE_NOT_FOUND',
        guardUserId,
        gateName,
        gateId,
      );
    }

    // The vehicle's OWN lifecycle can only RESTRICT, never grant: a revoked or
    // expired vehicle permit is red regardless of how healthy the owner is. The
    // owner is not resolved here, so the display block carries the vehicle only.
    if (vehicle.status !== 'active') {
      return this.denyVehicle(
        vehicle.id,
        'VEHICLE_INACTIVE',
        guardUserId,
        gateName,
        gateId,
        vehicleScanInfo(vehicle, vehicleOwnerType(vehicle), null),
      );
    }
    if (vehicle.expiresAt && new Date() > vehicle.expiresAt) {
      return this.denyVehicle(
        vehicle.id,
        'VEHICLE_EXPIRED',
        guardUserId,
        gateName,
        gateId,
        vehicleScanInfo(vehicle, vehicleOwnerType(vehicle), null),
      );
    }

    // A vehicle is never anonymous (DB CHECK: exactly one owner). Mirror the owner's
    // CURRENT status live — the barcode carries no admin data.
    if (vehicle.employeeId) {
      return this.resolveEmployeeOwnedVehicle(
        vehicle,
        guardUserId,
        gateName,
        gateId,
      );
    }
    if (vehicle.visitorPermitId) {
      return this.resolveVisitorOwnedVehicle(
        vehicle,
        guardUserId,
        gateName,
        gateId,
      );
    }

    // Defensive: the DB CHECK makes this unreachable — but never fail open.
    return this.denyVehicle(
      vehicle.id,
      'VEHICLE_NO_OWNER',
      guardUserId,
      gateName,
      gateId,
      vehicleScanInfo(vehicle, vehicleOwnerType(vehicle), null),
    );
  }

  private async resolveEmployeeOwnedVehicle(
    vehicle: VehiclePermit,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
  ): Promise<ScanDecision> {
    // The owner FK is the employee's internal UUID, so resolve by id (not self id).
    const employee = await this.employees.findById(vehicle.employeeId!);
    if (!employee) {
      return this.denyVehicle(
        vehicle.id,
        'OWNER_NOT_FOUND',
        guardUserId,
        gateName,
        gateId,
        vehicleScanInfo(vehicle, 'employee', null),
      );
    }
    if (!employee.canEnter()) {
      // Live DB status is the authority for the owner; distinguish a ban from an
      // inactive account for the audit trail.
      const reason = employee.isEntryBlocked ? 'OWNER_BANNED' : 'OWNER_INACTIVE';
      return this.denyVehicle(
        vehicle.id,
        reason,
        guardUserId,
        gateName,
        gateId,
        vehicleScanInfo(vehicle, 'employee', employeeScanInfo(employee)),
      );
    }
    return this.approveVehicle(
      vehicle,
      `Vehicle of: ${employee.fullName}`,
      employee.department,
      'employee',
      employeeScanInfo(employee),
      guardUserId,
      gateName,
      gateId,
    );
  }

  private async resolveVisitorOwnedVehicle(
    vehicle: VehiclePermit,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
  ): Promise<ScanDecision> {
    // Resolve the parent permit by its internal UUID and mirror its validity —
    // WITHOUT consuming it (no consumeSingleEntry here, ever).
    const permit = await this.permits.findById(vehicle.visitorPermitId!);
    if (!permit) {
      return this.denyVehicle(
        vehicle.id,
        'OWNER_PERMIT_NOT_FOUND',
        guardUserId,
        gateName,
        gateId,
        vehicleScanInfo(vehicle, 'visitor', null),
      );
    }

    const validity = this.visitorPermitValidityForVehicle(permit);
    if (!validity.ok) {
      return this.denyVehicle(
        vehicle.id,
        validity.reason,
        guardUserId,
        gateName,
        gateId,
        vehicleScanInfo(vehicle, 'visitor', visitorScanInfo(permit)),
      );
    }
    return this.approveVehicle(
      vehicle,
      `Visitor vehicle: ${permit.visitorName}`,
      permit.host,
      'visitor',
      visitorScanInfo(permit),
      guardUserId,
      gateName,
      gateId,
    );
  }

  /**
   * Owner-permit validity for a VEHICLE scan — READ-ONLY, never consumes. A scheduled
   * permit must be inside its window (strict inheritance). A single-entry permit is
   * lenient on `used`: the vehicle stays valid as long as the permit is not expired
   * or cancelled, precisely because the vehicle scan deliberately does not consume it.
   */
  private visitorPermitValidityForVehicle(
    permit: Permit,
  ): { ok: true } | { ok: false; reason: string } {
    if (permit.permitType === 'scheduled') {
      return permit.isValidScheduledAt(new Date());
    }
    // single_entry — `active` and `used` both admit the vehicle within the window.
    if (permit.status === 'cancelled') {
      return { ok: false, reason: 'CANCELLED' };
    }
    if (permit.status === 'expired') {
      return { ok: false, reason: 'EXPIRED' };
    }
    if (permit.expiresAt && new Date() > permit.expiresAt) {
      return { ok: false, reason: 'EXPIRED' };
    }
    return { ok: true };
  }

  private async approveVehicle(
    vehicle: VehiclePermit,
    subjectName: string,
    department: string,
    ownerType: 'employee' | 'visitor',
    owner: EmployeeScanInfo | VisitorScanInfo | null,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
  ): Promise<ScanDecision> {
    await this.audit.record({
      type: 'entry_check_approved',
      subjectType: 'vehicle',
      subjectRef: vehicle.id, // the vehicle UUID — not sensitive PII
      actorUserId: guardUserId,
      gateName,
      gateId: gateId ?? undefined,
      result: 'success',
    });
    return {
      result: 'GREEN',
      subjectName,
      department,
      subject: vehicleScanInfo(vehicle, ownerType, owner),
    };
  }

  private async denyVehicle(
    vehicleRef: string,
    reason: string,
    guardUserId: string,
    gateName?: string,
    gateId?: string | null,
    subject: ScanSubject | null = null,
  ): Promise<ScanDecision> {
    await this.audit.record({
      type: 'entry_check_denied',
      subjectType: 'vehicle',
      subjectRef: vehicleRef,
      actorUserId: guardUserId,
      gateName,
      gateId: gateId ?? undefined,
      result: 'failure',
      reason,
    });
    return { result: 'RED', reason, subject };
  }
}
