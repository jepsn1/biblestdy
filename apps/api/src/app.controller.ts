import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { healthStatus, type HealthStatus } from '@biblestdy/shared';
import {
  SessionGuard,
  type AuthedRequest,
  type SessionUser,
} from './auth/session.guard';

@Controller()
export class AppController {
  @Get('health')
  getHealth(): HealthStatus {
    return healthStatus('api');
  }

  @Get('me')
  @UseGuards(SessionGuard)
  getMe(@Req() req: AuthedRequest): SessionUser {
    return req.user;
  }
}
