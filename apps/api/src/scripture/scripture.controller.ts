import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { getBook, type Chapter, type Translation } from '@biblestdy/shared';
import {
  ChapterNotFoundError,
  SCRIPTURE_PROVIDER,
  type ScriptureProvider,
} from './provider';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { ReadingQuotaService } from '../reading-quota/service';

/** 429 body: machine-readable reason + wait (PRD #25 API contract). */
export interface ReadingLimitBody {
  reason: 'pace' | 'daily' | 'cooldown';
  retryAfterSeconds: number;
}

/**
 * Scripture text is licensed: signed-in sessions only (#26), and every
 * chapter request is paced by the reading quota (#29). The translations list
 * is never throttled.
 */
@Controller()
@UseGuards(SessionGuard)
export class ScriptureController {
  constructor(
    @Inject(SCRIPTURE_PROVIDER) private readonly provider: ScriptureProvider,
    private readonly quota: ReadingQuotaService,
  ) {}

  @Get('translations')
  listTranslations(): Promise<Translation[]> {
    return this.provider.listTranslations();
  }

  @Get('passages/:translationId/:book/:chapter')
  async getChapter(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('translationId') translationId: string,
    @Param('book') bookId: string,
    @Param('chapter', ParseIntPipe) chapter: number,
  ): Promise<Chapter> {
    const book = getBook(bookId.toUpperCase());
    if (!book) throw new BadRequestException(`Unknown book '${bookId}'`);
    if (chapter < 1 || chapter > book.chapters) {
      throw new BadRequestException(
        `${book.name} has ${book.chapters} chapters`,
      );
    }
    // Cached chapters count too: the quota guards text leaving, not API calls
    const outcome = await this.quota.check({
      userId: req.user.id,
      ip: req.ip,
      chapter: { translationId, book: book.id, chapter },
    });
    if (!outcome.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(outcome.retryAfterMs / 1000),
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));
      const body: ReadingLimitBody = {
        reason: outcome.reason,
        retryAfterSeconds,
      };
      throw new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      return await this.provider.getChapter(translationId, book.id, chapter);
    } catch (err) {
      if (err instanceof ChapterNotFoundError)
        throw new NotFoundException(err.message);
      throw err;
    }
  }
}
