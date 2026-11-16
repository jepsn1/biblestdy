import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { FumsViewsDto } from './fums.dto';
import { FumsReporter } from './fums.reporter';

/**
 * The reader reports what it showed (not what it fetched: reading ahead is
 * no view); the API relays it to API.Bible's FUMS. Answers at once, the
 * relay runs behind.
 */
@Controller('fums')
@UseGuards(SessionGuard)
export class FumsController {
  constructor(@Inject(FumsReporter) private readonly reporter: FumsReporter) {}

  @Post('views')
  @HttpCode(204)
  views(@Req() req: AuthedRequest, @Body() dto: FumsViewsDto): void {
    const tokens = [...new Set(dto.tokens)];
    void this.reporter.report(tokens, req.user.sessionId ?? req.user.id);
  }
}
