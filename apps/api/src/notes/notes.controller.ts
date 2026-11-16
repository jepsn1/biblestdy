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
import { payloadAnchor, type Note } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { AnchorDto, CreateNoteDto, UpdateNoteDto } from './note.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(SessionGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  /** No query params: ALL the user's notes (attach-picker). With
   * translation+book+chapter: notes touching that chapter in ANY translation
   * (anchor or inline ref, #158) — `translation` is still required (the
   * reading translation; clients key caches by it) but doesn't filter. */
  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('translation') translationId?: string,
    @Query('book') book?: string,
    @Query('chapter') chapter?: string,
  ): Promise<Note[]> {
    if (!translationId && !book && !chapter) {
      return this.notes.listAll(req.user.id);
    }
    const chapterNum = Number(chapter);
    if (!translationId || !book || !Number.isInteger(chapterNum)) {
      throw new BadRequestException(
        'translation, book and chapter are required',
      );
    }
    return this.notes.listForChapter(req.user.id, book, chapterNum);
  }

  /** With an anchor (made from a selection) or without (a draft written on
   * the Notes page) — never half an anchor. */
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateNoteDto): Promise<Note> {
    const anchor = payloadAnchor(dto);
    if (anchor === 'partial') {
      throw new BadRequestException(
        'an anchor needs all seven fields, or none',
      );
    }
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

  /** Undo a delete (#64): the row comes back as it was. */
  @Post(':id/restore')
  async restore(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<Note> {
    const restored = await this.notes.restore(req.user.id, id);
    if (!restored) throw new NotFoundException();
    return restored;
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

  @Post(':id/anchors')
  async addAnchor(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: AnchorDto,
  ): Promise<Note> {
    const updated = await this.notes.addAnchor(req.user.id, id, dto);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id/anchors/:anchorId')
  async removeAnchor(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('anchorId') anchorId: string,
  ): Promise<Note> {
    const result = await this.notes.removeAnchor(req.user.id, id, anchorId);
    if (!result) throw new NotFoundException();
    return result;
  }
}
