import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** The sign-in session (one per device/browser): FUMS derives its
   * anonymous device id from it. Absent in tests' stand-in guards. */
  sessionId?: string;
}

export type AuthedRequest = Request & { user: SessionUser };

/** Rejects requests without a valid Better Auth session cookie. */
@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new UnauthorizedException();
    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      sessionId: session.session.id,
    };
    return true;
  }
}
