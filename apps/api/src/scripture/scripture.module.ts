import { Logger, Module } from '@nestjs/common';
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
  ],
})
export class ScriptureModule {}
