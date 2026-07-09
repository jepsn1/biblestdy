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
import type { Annotation } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { CreateAnnotationDto, UpdateAnnotationDto } from './annotation.dto';
import { AnnotationsService } from './annotations.service';

@Controller('annotations')
@UseGuards(SessionGuard)
export class AnnotationsController {
  constructor(private readonly annotations: AnnotationsService) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('translation') translationId: string,
    @Query('book') book: string,
    @Query('chapter') chapter: string,
  ): Promise<Annotation[]> {
    const chapterNum = Number(chapter);
    if (!translationId || !book || !Number.isInteger(chapterNum)) {
      throw new BadRequestException(
        'translation, book and chapter are required',
      );
    }
    return this.annotations.listForChapter(
      req.user.id,
      translationId,
      book,
      chapterNum,
    );
  }

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateAnnotationDto,
  ): Promise<Annotation> {
    return this.annotations.create(req.user.id, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAnnotationDto,
  ): Promise<Annotation> {
    if (
      dto.text === undefined &&
      dto.offsetX === undefined &&
      dto.offsetY === undefined &&
      dto.width === undefined
    ) {
      throw new BadRequestException('nothing to update');
    }
    const updated = await this.annotations.update(req.user.id, id, dto);
    if (!updated) throw new NotFoundException();
    return updated;
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    const removed = await this.annotations.remove(req.user.id, id);
    if (!removed) throw new NotFoundException();
    return { ok: true };
  }
}
