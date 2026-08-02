import { validatePassword } from './password-policy';

describe('validatePassword', () => {
  it('accepts a strong password (all 4 categories, >= 12 chars)', () => {
    expect(validatePassword('Str0ng-Passw0rd!').valid).toBe(true);
  });

  it('accepts exactly 3 of 4 categories', () => {
    // lower + upper + digit, no symbol, length 12
    expect(validatePassword('AbcdefghIjk1').valid).toBe(true);
  });

  it('rejects a password shorter than 12 characters', () => {
    const result = validatePassword('Ab1!aaa');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('PASSWORD_TOO_SHORT_MIN_12');
  });

  it('rejects fewer than 3 character categories', () => {
    // only lowercase
    const result = validatePassword('abcdefghijklmnop');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('PASSWORD_NEEDS_3_OF_4_CATEGORIES');
  });

  it('rejects a well-known common password', () => {
    expect(validatePassword('password').errors).toContain(
      'PASSWORD_TOO_COMMON',
    );
  });

  it('rejects a password that contains the username', () => {
    const result = validatePassword('superadmin-9X!', {
      username: 'superadmin',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('PASSWORD_CONTAINS_USERNAME');
  });
});
