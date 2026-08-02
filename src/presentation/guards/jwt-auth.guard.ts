import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AuthenticatedUser {
  sub: string;
  role: string;
  scope?: string;
}

/**
 * Verifies the RS256 Bearer token and attaches the authenticated user to the
 * request. RS256 verification uses the PUBLIC key only — the signing key never
 * reaches the request path — and the algorithm is pinned to block 'alg: none'
 * and HS/RS downgrade-confusion attacks.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('MISSING_BEARER_TOKEN');
    }

    const token = header.slice('Bearer '.length).trim();

    try {
      const payload = await this.jwt.verifyAsync<AuthenticatedUser>(token, {
        algorithms: ['RS256'],
      });
      req.user = {
        sub: payload.sub,
        role: payload.role,
        scope: payload.scope,
      };
      return true;
    } catch {
      // Do not reveal whether the token was expired vs malformed — generic 401.
      throw new UnauthorizedException('INVALID_TOKEN');
    }
  }
}
