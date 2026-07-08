import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { getBook, type Chapter, type Translation } from '@biblestdy/shared';
import {
  ChapterNotFoundError,
  SCRIPTURE_PROVIDER,
  type ScriptureProvider,
} from './provider';

@Controller()
export class ScriptureController {
  constructor(
    @Inject(SCRIPTURE_PROVIDER) private readonly provider: ScriptureProvider,
  ) {}

  @Get('translations')
  listTranslations(): Promise<Translation[]> {
    return this.provider.listTranslations();
  }

  @Get('passages/:translationId/:book/:chapter')
  async getChapter(
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
    try {
      return await this.provider.getChapter(translationId, book.id, chapter);
    } catch (err) {
      if (err instanceof ChapterNotFoundError)
        throw new NotFoundException(err.message);
      throw err;
    }
  }
}
