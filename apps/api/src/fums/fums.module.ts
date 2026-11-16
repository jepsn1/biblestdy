import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { FumsController } from './fums.controller';
import { FumsReporter } from './fums.reporter';

@Module({
  controllers: [FumsController],
  providers: [
    {
      provide: FumsReporter,
      useFactory: () => {
        const logger = new Logger('Fums');
        return new FumsReporter({
          // Domain-separated by the HMAC input; random = ids change on restart
          secret:
            process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString('hex'),
          onError: (err) => logger.warn(`report failed: ${String(err)}`),
        });
      },
    },
  ],
})
export class FumsModule {}
