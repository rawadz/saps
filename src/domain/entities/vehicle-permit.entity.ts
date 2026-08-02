export type VehicleType = 'private' | 'public' | 'government';

export interface VehiclePermitProps {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType | null;
  color: string | null;
  make: string | null;
  model: string | null;
  barcodeToken: string | null; // signed HMAC token: v1.<base64url(vehicle:<id>)>.<sig>
  status: string;
  expiresAt: Date | null;
  // Exactly one of these owner references is set (DB CHECK: vehicle_must_have_owner).
  employeeId: string | null; // internal employee UUID
  visitorPermitId: string | null; // internal visitor-permit UUID
  createdAt: Date;
}

/**
 * Vehicle permit. A vehicle is never anonymous: it is linked to exactly one owner
 * — an employee OR a visitor permit (enforced by the use-case and the DB CHECK).
 * Plain data for now; gate-scan resolution of the owner's live status belongs to
 * the gate flow and is intentionally NOT part of this step.
 */
export class VehiclePermit {
  readonly id: string;
  readonly plateNumber: string;
  readonly vehicleType: VehicleType | null;
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly barcodeToken: string | null;
  readonly status: string;
  readonly expiresAt: Date | null;
  readonly employeeId: string | null;
  readonly visitorPermitId: string | null;
  readonly createdAt: Date;

  constructor(props: VehiclePermitProps) {
    this.id = props.id;
    this.plateNumber = props.plateNumber;
    this.vehicleType = props.vehicleType;
    this.color = props.color;
    this.make = props.make;
    this.model = props.model;
    this.barcodeToken = props.barcodeToken;
    this.status = props.status;
    this.expiresAt = props.expiresAt;
    this.employeeId = props.employeeId;
    this.visitorPermitId = props.visitorPermitId;
    this.createdAt = props.createdAt;
  }
}
