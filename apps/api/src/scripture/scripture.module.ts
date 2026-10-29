import { Logger, Module } from '@nestjs/common';
import { db } from '../db';
import { DrizzleQuotaStore } from '../reading-quota/drizzle.store';
import { QuotaPruneSchedule } from '../reading-quota/prune.schedule';
import { ReadingQuotaService } from '../reading-quota/service';
import { ApiBibleProvider } from './apibible.provider';
import { CachingScriptureProvider } from './caching.provider';
import { FakeScriptureProvider } from './fake.provider';
import { SCRIPTURE_PROVIDER } from './provider';
import { ScriptureController } from './scripture.controller';

@Module({
  controllers: [ScriptureController],
  providers: [
    {
      provide: SCRIPTURE_PROVIDER,
      useFactory: () => {
        const key = process.env.API_BIBLE_KEY;
        if (key) return new CachingScriptureProvider(new ApiBibleProvider(key));
        new Logger('ScriptureModule').warn(
          'API_BIBLE_KEY not set — serving fixture chapters via FakeScriptureProvider',
        );
        return new FakeScriptureProvider();
      },
    },
    {
      provide: ReadingQuotaService,
      useFactory: () =>
        new ReadingQuotaService({
          store: new DrizzleQuotaStore(db),
          logger: new Logger('ReadingQuota'),
        }),
    },
    QuotaPruneSchedule,
  ],
})
export class ScriptureModule {}
