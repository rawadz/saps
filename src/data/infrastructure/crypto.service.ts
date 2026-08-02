import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

/**
 * AES-256-GCM field encryption + a deterministic keyed search hash.
 *
 * GCM is authenticated encryption: the auth tag lets `decrypt` detect any
 * tampering. Because GCM uses a fresh random IV per call, the same plaintext
 * encrypts differently each time — which is exactly why we ALSO keep a
 * deterministic keyed hash for equality lookups on the encrypted column.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer; // 32 bytes for AES-256
  private readonly searchKey: Buffer; // separate key for the deterministic hash

  constructor(config: ConfigService) {
    const keyHex = config.get<string>('crypto.aesKeyHex') ?? '';
    const searchKeyHex = config.get<string>('crypto.searchHashKeyHex') ?? '';

    // Fail fast: refuse to run with a missing or wrong-length key rather than
    // operate with weak crypto.
    if (Buffer.from(keyHex, 'hex').length !== 32) {
      throw new Error('AES_KEY_HEX must be 32 bytes (64 hex chars)');
    }
    if (Buffer.from(searchKeyHex, 'hex').length !== 32) {
      throw new Error('SEARCH_HASH_KEY_HEX must be 32 bytes (64 hex chars)');
    }

    this.key = Buffer.from(keyHex, 'hex');
    this.searchKey = Buffer.from(searchKeyHex, 'hex');
  }

  /** Returns a self-contained string: ivHex:authTagHex:cipherHex */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(stored: string): string {
    const [ivHex, tagHex, dataHex] = stored.split(':');
    if (!ivHex || !tagHex || !dataHex) {
      throw new Error('Malformed ciphertext');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(), // throws if the auth tag fails — tamper detection
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * Deterministic keyed hash for equality lookups on encrypted columns. Same
   * input -> same output, so it can be indexed and used in a WHERE clause,
   * without being reversible or exposing the plaintext.
   */
  deterministicHash(value: string): string {
    return createHmac('sha256', this.searchKey).update(value).digest('hex');
  }
}
