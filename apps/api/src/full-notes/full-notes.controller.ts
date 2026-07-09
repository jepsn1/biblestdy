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
import type { FullNote } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { CreateFullNoteDto, UpdateFullNoteDto } from './full-note.dto';
import { FullNotesService } from './full-notes.service';

@Controller('full-notes')
@UseGuards(SessionGuard)
export class FullNotesController {
  constructor(private readonly fullNotes: FullNotesService) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('translation') translationId: string,
    @Query('book') book: string,
    @Query('chapter') chapter: string,
  ): Promise<FullNote[]> {
    const chapterNum = Number(chapter);
    if (!translationId || !book || !Number.isInteger(chapterNum)) {
      throw new BadRequestException(
        'translation, book and chapter are required',
      );
    }
    return this.fullNotes.listForChapter(
      req.user.id,
      translationId,
      book,
      chapterNum,
    );
  }

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateFullNoteDto,
  ): Promise<FullNote> {
    return this.fullNotes.create(req.user.id, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFullNoteDto,
  ): Promise<FullNote> {
    if (dto.title === undefined && dto.body === undefined) {
      throw new BadRequestException('nothing to update');
    }
    const updated = await this.fullNotes.update(req.user.id, id, dto);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const removed = await this.fullNotes.remove(req.user.id, id);
    if (!removed) throw new NotFoundException();
    return { ok: true };
  }
}
