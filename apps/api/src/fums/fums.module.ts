import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { FumsController } from './fums.controller';
import { FumsPacer, IssuedTokens } from './fums.guard';
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
    { provide: FumsPacer, useFactory: () => new FumsPacer() },
    // One ledger: the scripture controller records, the relay checks
    { provide: IssuedTokens, useFactory: () => new IssuedTokens() },
  ],
  exports: [IssuedTokens],
})
export class FumsModule {}
