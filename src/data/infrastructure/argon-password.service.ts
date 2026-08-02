import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordService } from '../../domain/services/password.service';
import { ARGON2_OPTIONS } from './argon.options';

@Injectable()
export class ArgonPasswordService implements PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // A malformed hash must fail closed, never throw to the caller.
      return false;
    }
  }

  // Decoy used when the user does not exist so a failed login for a missing user
  // costs the same time as for a real one (anti-enumeration).
  dummyHash(): string {
    return (
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$' +
      '0000000000000000000000000000000000000000000'
    );
  }
}
