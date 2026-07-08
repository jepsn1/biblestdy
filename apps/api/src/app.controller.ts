import { Controller, Get } from '@nestjs/common';
import { healthStatus, type HealthStatus } from '@biblestdy/shared';

@Controller()
export class AppController {
  @Get('health')
  getHealth(): HealthStatus {
    return healthStatus('api');
  }
}
