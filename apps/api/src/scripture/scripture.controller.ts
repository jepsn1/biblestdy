import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  ParseIntPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  getBook,
  translationInfo,
  type Chapter,
  type Translation,
} from '@biblestdy/shared';
import { chapterLimit } from '@biblestdy/shared/versification';
import {
  ChapterNotFoundError,
  SCRIPTURE_PROVIDER,
  type ScriptureProvider,
} from './provider';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { ReadingQuotaService } from '../reading-quota/service';
import { fumsSessionKey, IssuedTokens } from '../fums/fums.guard';

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
    // Absent in tests that don't exercise FUMS
    @Optional() @Inject(IssuedTokens) private readonly issued?: IssuedTokens,
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
    if (
      chapter < 1 ||
      (chapter > book.chapters &&
        chapter > (await this.chapterBound(translationId, book.id)))
    ) {
      throw new BadRequestException(
        `${book.name} has ${book.chapters} chapters`,
      );
    }
    // Cached chapters count too: the quota guards text leaving, not API calls
    // (a chapter this reader already read today is free: no new text leaves)
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
    // Lets the reader read ahead only while the bucket has room (#flow)
    res.setHeader('RateLimit-Remaining', String(outcome.remaining));
    try {
      const text = await this.provider.getChapter(
        translationId,
        book.id,
        chapter,
      );
      // Its views may be reported by this session only (fums.guard.ts)
      if (text.fumsToken) {
        this.issued?.record(fumsSessionKey(req.user), text.fumsToken);
      }
      return text;
    } catch (err) {
      if (err instanceof ChapterNotFoundError)
        throw new NotFoundException(err.message);
      throw err;
    }
  }

  /** Chapters a book may have in this translation's own versification
   * (#166): BPH numbers the OT the Hebrew way, so it has Joel 4. Only looked
   * up past the English count, so normal reads never list translations. */
  private async chapterBound(translationId: string, bookId: string) {
    const translation = (await this.provider.listTranslations()).find(
      (t) => t.id === translationId,
    );
    const scheme = translation
      ? translationInfo(translation.abbreviation)?.versification
      : undefined;
    return chapterLimit(bookId, scheme ?? 'eng');
  }
}
