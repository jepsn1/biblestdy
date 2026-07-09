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
import type { Note } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { CreateNoteDto, UpdateNoteDto } from './note.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(SessionGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('translation') translationId: string,
    @Query('book') book: string,
    @Query('chapter') chapter: string,
  ): Promise<Note[]> {
    const chapterNum = Number(chapter);
    if (!translationId || !book || !Number.isInteger(chapterNum)) {
      throw new BadRequestException(
        'translation, book and chapter are required',
      );
    }
    return this.notes.listForChapter(
      req.user.id,
      translationId,
      book,
      chapterNum,
    );
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateNoteDto): Promise<Note> {
    return this.notes.create(req.user.id, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<Note> {
    if (dto.title === undefined && dto.body === undefined) {
      throw new BadRequestException('nothing to update');
    }
    const updated = await this.notes.update(req.user.id, id, dto);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const removed = await this.notes.remove(req.user.id, id);
    if (!removed) throw new NotFoundException();
    return { ok: true };
  }
}
