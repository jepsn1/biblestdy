import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { purgeDeleted } from './purge';

const EVERY_MS = 15 * 60_000;

/** Purges expired soft-deleted rows (#64) at startup and every 15 min. */
@Injectable()
export class TrashPurgeSchedule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Trash');
  private timer?: NodeJS.Timeout;

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
      await purgeDeleted();
    } catch (err) {
      this.logger.error(`trash purge failed: ${String(err)}`);
    }
  }
}
