/**
 * Password policy for administrative accounts (pure domain logic, no framework).
 *
 * Rules (per the project's security standards):
 *   • minimum 12 characters
 *   • at least 3 of the 4 character categories: lowercase, uppercase, digit, symbol
 *   • not a well-known common password
 *   • must not contain the username
 *   • NO forced periodic rotation — a strong password is not expired on a timer
 *     (rotation is only required after a reset / first-login `mustChangePassword`).
 *
 * Employee accounts have no password at all, so this never applies to them.
 */

// A representative slice of the most common passwords. In production, back this
// with a large bundled list (e.g. the top 100k) or a breached-password check.
const COMMON_PASSWORDS = new Set<string>([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword1',
  'qwerty',
  'qwerty123',
  'azerty',
  '111111',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'iloveyou',
  'admin',
  'admin123',
  'administrator',
  'welcome',
  'welcome1',
  'welcome123',
  'letmein',
  'letmein123',
  'changeme',
  'changeme123',
  'abc123',
  'abcd1234',
  'monkey',
  'dragon',
  'master',
  'superman',
  'trustno1',
  'sunshine',
  'football',
  'baseball',
  'starwars',
  'whatever',
  'zaq12wsx',
  'qazwsx',
]);

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

export interface PasswordPolicyContext {
  username?: string;
}

export const MIN_PASSWORD_LENGTH = 12;
export const MIN_CHARACTER_CATEGORIES = 3;

export function validatePassword(
  password: string,
  context: PasswordPolicyContext = {},
): PasswordPolicyResult {
  const errors: string[] = [];
  const value = typeof password === 'string' ? password : '';

  if (value.length < MIN_PASSWORD_LENGTH) {
    errors.push(`PASSWORD_TOO_SHORT_MIN_${MIN_PASSWORD_LENGTH}`);
  }

  const categories = countCharacterCategories(value);
  if (categories < MIN_CHARACTER_CATEGORIES) {
    errors.push(`PASSWORD_NEEDS_${MIN_CHARACTER_CATEGORIES}_OF_4_CATEGORIES`);
  }

  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    errors.push('PASSWORD_TOO_COMMON');
  }

  const username = context.username?.trim().toLowerCase();
  if (
    username &&
    username.length >= 3 &&
    value.toLowerCase().includes(username)
  ) {
    errors.push('PASSWORD_CONTAINS_USERNAME');
  }

  return { valid: errors.length === 0, errors };
}

function countCharacterCategories(value: string): number {
  let count = 0;
  if (/[a-z]/.test(value)) count++;
  if (/[A-Z]/.test(value)) count++;
  if (/[0-9]/.test(value)) count++;
  // Anything that is not a letter or digit counts as a symbol.
  if (/[^A-Za-z0-9]/.test(value)) count++;
  return count;
}
