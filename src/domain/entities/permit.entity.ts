import { PersonnelType } from './employee.entity';

export type PermitType = 'scheduled' | 'single_entry';
export type PermitStatus = 'active' | 'used' | 'expired' | 'cancelled';

export interface PermitProps {
  id: string;
  permitNumber: string;
  token: string | null; // signed HMAC token: v1.<base64url(permit:<number>)>.<sig>
  permitType: PermitType;
  status: PermitStatus;
  visitorName: string;
  idOrPhone: string | null; // decrypted for an authorized reader; null if absent
  personnelType: PersonnelType | null;
  host: string;
  reason: string | null;
  startDate: Date | null;
  endDate: Date | null;
  allowedDays: number[];
  allowedTimeFrom: string | null;
  allowedTimeTo: string | null;
  expiresAt: Date | null;
  usedAt: Date | null;
  issuedBy: string | null;
  createdAt: Date;
}

/**
 * Visitor permit (scheduled or single-entry). Plain data for now — scan-time
 * validity (isValidAt) and single-entry consumption belong to the gate flow and
 * are intentionally NOT part of this step.
 */
export class Permit {
  readonly id: string;
  readonly permitNumber: string;
  readonly token: string | null;
  readonly permitType: PermitType;
  readonly status: PermitStatus;
  readonly visitorName: string;
  readonly idOrPhone: string | null;
  readonly personnelType: PersonnelType | null;
  readonly host: string;
  readonly reason: string | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly allowedDays: number[];
  readonly allowedTimeFrom: string | null;
  readonly allowedTimeTo: string | null;
  readonly expiresAt: Date | null;
  readonly usedAt: Date | null;
  readonly issuedBy: string | null;
  readonly createdAt: Date;

  constructor(props: PermitProps) {
    this.id = props.id;
    this.permitNumber = props.permitNumber;
    this.token = props.token;
    this.permitType = props.permitType;
    this.status = props.status;
    this.visitorName = props.visitorName;
    this.idOrPhone = props.idOrPhone;
    this.personnelType = props.personnelType;
    this.host = props.host;
    this.reason = props.reason;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.allowedDays = props.allowedDays;
    this.allowedTimeFrom = props.allowedTimeFrom;
    this.allowedTimeTo = props.allowedTimeTo;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.issuedBy = props.issuedBy;
    this.createdAt = props.createdAt;
  }

  /**
   * Scan-time validity for a SCHEDULED permit: active, within [startDate, endDate],
   * on an allowed weekday (if any), and within the daily time window (if any).
   * Single-entry validity/consumption is handled by the gate use-case + repository,
   * not here.
   */
  isValidScheduledAt(now: Date): { ok: true } | { ok: false; reason: string } {
    if (this.status !== 'active') {
      return { ok: false, reason: 'NOT_ACTIVE' };
    }
    if (this.startDate && now < this.startDate) {
      return { ok: false, reason: 'OUT_OF_DATE_RANGE' };
    }
    if (this.endDate && now > this.endDate) {
      return { ok: false, reason: 'OUT_OF_DATE_RANGE' };
    }
    if (
      this.allowedDays.length > 0 &&
      !this.allowedDays.includes(now.getDay())
    ) {
      return { ok: false, reason: 'DAY_NOT_ALLOWED' };
    }
    const hhmm = now.toTimeString().slice(0, 5);
    if (this.allowedTimeFrom && hhmm < this.allowedTimeFrom) {
      return { ok: false, reason: 'OUTSIDE_HOURS' };
    }
    if (this.allowedTimeTo && hhmm > this.allowedTimeTo) {
      return { ok: false, reason: 'OUTSIDE_HOURS' };
    }
    return { ok: true };
  }
}
