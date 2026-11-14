import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Highlight } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { CreateHighlightDto, UpdateHighlightDto } from './create-highlight.dto';
import { HighlightsService } from './highlights.service';

@Controller('highlights')
@UseGuards(SessionGuard)
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  /** No query params: ALL the user's highlights (palette search). With
   * translation+book+chapter: that chapter's highlights. */
  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('translation') translationId?: string,
    @Query('book') book?: string,
    @Query('chapter') chapter?: string,
  ): Promise<Highlight[]> {
    if (!translationId && !book && !chapter) {
      return this.highlights.listAll(req.user.id);
    }
    const chapterNum = Number(chapter);
    if (!translationId || !book || !Number.isInteger(chapterNum)) {
      throw new BadRequestException(
        'translation, book and chapter are required',
      );
    }
    return this.highlights.listForChapter(
      req.user.id,
      translationId,
      book,
      chapterNum,
    );
  }

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateHighlightDto,
  ): Promise<Highlight> {
    return this.highlights.create(req.user.id, dto);
  }

  /** Undo a delete (#64): the row comes back as it was. */
  @Post(':id/restore')
  async restore(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<Highlight> {
    const restored = await this.highlights.restore(req.user.id, id);
    if (!restored) throw new NotFoundException();
    return restored;
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateHighlightDto,
  ): Promise<Highlight> {
    if (dto.color === undefined && dto.quote === undefined) {
      throw new BadRequestException('nothing to update');
    }
    const updated = await this.highlights.update(req.user.id, id, dto);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const removed = await this.highlights.remove(req.user.id, id);
    if (!removed) throw new NotFoundException();
    return { ok: true };
  }
}
