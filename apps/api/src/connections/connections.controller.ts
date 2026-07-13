import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ChapterConnections } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { ConnectionsService } from './connections.service';

@Controller('connections')
@UseGuards(SessionGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  async forChapter(
    @Req() req: AuthedRequest,
    @Query('translation') translationId: string,
    @Query('book') book: string,
    @Query('chapter') chapter: string,
  ): Promise<ChapterConnections> {
    const chapterNum = Number(chapter);
    if (!translationId || !book || !Number.isInteger(chapterNum)) {
      throw new BadRequestException(
        'translation, book and chapter are required',
      );
    }
    return this.connections.forChapter(
      req.user.id,
      translationId,
      book,
      chapterNum,
    );
  }
}
