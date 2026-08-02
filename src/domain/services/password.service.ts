/**
 * Password hashing contract. The implementation uses Argon2id (never MD5/SHA/bcrypt).
 */
export interface PasswordService {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;

  /**
   * A decoy hash used when the user does not exist, so a failed login for a
   * missing user costs the same time as for a real one (anti-enumeration).
   */
  dummyHash(): string;
}

export const PASSWORD_SERVICE = Symbol('PasswordService');
