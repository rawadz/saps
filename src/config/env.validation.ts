/**
 * Fail-fast environment validation, run by ConfigModule at startup.
 *
 * Security posture (per the project's hard rules): it is better to REFUSE to boot
 * than to run with a missing or weak key. Every problem is collected and reported
 * at once so an operator can fix the whole `.env` in a single pass.
 */

const HEX_64 = /^[0-9a-fA-F]{64}$/; // exactly 32 bytes expressed as hex

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  const get = (key: string): string => {
    const value = config[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  // ── Cryptographic keys ─────────────────────────────────────────────────────
  if (!HEX_64.test(get('AES_KEY_HEX'))) {
    errors.push('AES_KEY_HEX must be 32 bytes (64 hex characters).');
  }
  if (!HEX_64.test(get('SEARCH_HASH_KEY_HEX'))) {
    errors.push('SEARCH_HASH_KEY_HEX must be 32 bytes (64 hex characters).');
  }
  if (
    HEX_64.test(get('AES_KEY_HEX')) &&
    get('AES_KEY_HEX') === get('SEARCH_HASH_KEY_HEX')
  ) {
    // Reusing one key for encryption and the lookup hash weakens both.
    errors.push('AES_KEY_HEX and SEARCH_HASH_KEY_HEX must be different keys.');
  }
  if (get('BARCODE_HMAC_SECRET').length < 32) {
    errors.push('BARCODE_HMAC_SECRET must be set and at least 32 characters.');
  }

  // ── PostgreSQL: either a full DATABASE_URL or the discrete parts ────────────
  if (!get('DATABASE_URL')) {
    for (const key of [
      'POSTGRES_HOST',
      'POSTGRES_PORT',
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_DB',
    ]) {
      if (!get(key)) {
        errors.push(`${key} is required when DATABASE_URL is not set.`);
      }
    }
  }

  // ── Redis: either a full REDIS_URL or host + port ───────────────────────────
  if (!get('REDIS_URL')) {
    for (const key of ['REDIS_HOST', 'REDIS_PORT']) {
      if (!get(key)) {
        errors.push(`${key} is required when REDIS_URL is not set.`);
      }
    }
  }

  // ── JWT RS256: a private key (to sign) and a public key (to verify) ─────────
  if (!get('JWT_PRIVATE_KEY') && !get('JWT_PRIVATE_KEY_PATH')) {
    errors.push(
      'JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH is required (RS256 signing key).',
    );
  }
  if (!get('JWT_PUBLIC_KEY') && !get('JWT_PUBLIC_KEY_PATH')) {
    errors.push(
      'JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH is required (RS256 verify key).',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
