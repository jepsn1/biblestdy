import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ReadingQuotaService } from './service';

const EVERY_MS = 6 * 3_600_000;

/** Prunes old quota rows at startup and every 6 h (user story 24). */
@Injectable()
export class QuotaPruneSchedule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReadingQuota');
  private timer?: NodeJS.Timeout;

  constructor(private readonly quota: ReadingQuotaService) {}

  onModuleInit(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      await this.quota.prune();
    } catch (err) {
      this.logger.error(`quota prune failed: ${String(err)}`);
    }
  }
}
