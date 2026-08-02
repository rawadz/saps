import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { BarcodeService } from '../../domain/services/barcode.service';

/**
 * HMAC-SHA256 implementation of the Domain's BarcodeService contract.
 *
 * Token format:  v1.<base64url(employeeId)>.<base64url(hmac)>
 *
 * The barcode encodes the Employee ID ONLY and is signed with a secret from an
 * environment-isolated variable. No department/rank/clearance is ever embedded —
 * that would carry stale authorization on a printed copy and widen the forgery
 * surface. Status is always resolved live at scan time.
 */
@Injectable()
export class HmacBarcodeService implements BarcodeService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('crypto.barcodeHmacSecret') ?? '';
    // Fail fast: never sign or verify with a weak/empty secret.
    if (secret.length < 32) {
      throw new Error('BARCODE_HMAC_SECRET missing or too short (>= 32 chars)');
    }
    this.secret = secret;
  }

  generate(employeeId: string): string {
    const payload = Buffer.from(employeeId, 'utf8').toString('base64url');
    return `v1.${payload}.${this.sign(payload)}`;
  }

  verify(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
      return null;
    }

    const [, payload, providedSig] = parts;
    const expectedSig = this.sign(payload);

    // Constant-time comparison to prevent signature-timing side channels.
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    try {
      return Buffer.from(payload, 'base64url').toString('utf8');
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload)
      .digest('base64url');
  }
}
