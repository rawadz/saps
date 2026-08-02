/**
 * Contract for barcode signing/verification. A barcode is a stable, signed
 * reference to an Employee ID and nothing more — no department, rank or clearance
 * is ever embedded. The signing algorithm (HMAC-SHA256) lives in the Data layer.
 */
export interface BarcodeService {
  /** Produce the permanent token encoded into the employee's QR (generated once). */
  generate(employeeId: string): string;

  /**
   * Verify a token's signature and return the Employee ID if authentic, or null.
   * Authenticity only — it does NOT decide access. Authorization is resolved
   * live from the database/ban list so an offline screenshot can still be denied.
   */
  verify(token: string): string | null;
}

// Injection token — a Symbol so the Domain stays free of framework imports.
export const BARCODE_SERVICE = Symbol('BarcodeService');
