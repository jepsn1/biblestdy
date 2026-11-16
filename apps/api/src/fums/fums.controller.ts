import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { FumsViewsDto } from './fums.dto';
import { FumsPacer, fumsSessionKey, IssuedTokens } from './fums.guard';
import { FumsReporter } from './fums.reporter';

/**
 * The reader reports what it showed (not what it fetched: reading ahead is
 * no view); the API relays it to API.Bible's FUMS. Paced per session and
 * IP, and only tokens this server served to this session are relayed
 * (fums.guard.ts) — anything else is dropped quietly. Answers at once, the
 * relay runs behind.
 */
@Controller('fums')
@UseGuards(SessionGuard)
export class FumsController {
  private readonly logger = new Logger('Fums');

  constructor(
    @Inject(FumsReporter) private readonly reporter: FumsReporter,
    @Inject(FumsPacer) private readonly pacer: FumsPacer,
    @Inject(IssuedTokens) private readonly issued: IssuedTokens,
  ) {}

  @Post('views')
  @HttpCode(204)
  views(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: FumsViewsDto,
  ): void {
    const session = fumsSessionKey(req.user);
    const paced = this.pacer.take(session, req.ip);
    if (!paced.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(paced.retryAfterMs / 1000),
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        { retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const reported = [...new Set(dto.tokens)];
    const tokens = this.issued.accept(session, reported);
    if (tokens.length < reported.length) {
      this.logger.debug(
        `dropped ${reported.length - tokens.length} token(s) not served to this session`,
      );
    }
    if (tokens.length > 0) void this.reporter.report(tokens, session);
  }
}
