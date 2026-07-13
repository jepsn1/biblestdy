import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Tag } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { TagNameDto, TagPassageDto } from './tag.dto';
import { TagsService, type Topic } from './tags.service';

function passageFromQuery(
  translationId?: string,
  book?: string,
  chapter?: string,
) {
  const chapterNum = Number(chapter);
  if (!translationId || !book || !Number.isInteger(chapterNum)) {
    throw new BadRequestException('translation, book and chapter are required');
  }
  return { translationId, book, chapter: chapterNum };
}

@Controller('tags')
@UseGuards(SessionGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@Req() req: AuthedRequest): Promise<Tag[]> {
    return this.tags.listTags(req.user.id);
  }

  /** The topic page: everything tagged with :name. */
  @Get('topic/:name')
  async topic(
    @Req() req: AuthedRequest,
    @Param('name') name: string,
  ): Promise<Topic> {
    const topic = await this.tags.topic(req.user.id, name);
    if (!topic) throw new NotFoundException();
    return topic;
  }

  @Get('note/:noteId')
  async forNote(
    @Req() req: AuthedRequest,
    @Param('noteId') noteId: string,
  ): Promise<Tag[]> {
    const tags = await this.tags.tagsForNote(req.user.id, noteId);
    if (!tags) throw new NotFoundException();
    return tags;
  }

  @Post('note/:noteId')
  async tagNote(
    @Req() req: AuthedRequest,
    @Param('noteId') noteId: string,
    @Body() dto: TagNameDto,
  ): Promise<Tag[]> {
    const tags = await this.tags.tagNote(req.user.id, noteId, dto.name);
    if (tags === null) throw new NotFoundException();
    if (tags === 'invalid-name')
      throw new BadRequestException('invalid tag name');
    return tags;
  }

  @Delete('note/:noteId/:tagId')
  async untagNote(
    @Req() req: AuthedRequest,
    @Param('noteId') noteId: string,
    @Param('tagId') tagId: string,
  ): Promise<Tag[]> {
    const tags = await this.tags.untagNote(req.user.id, noteId, tagId);
    if (!tags) throw new NotFoundException();
    return tags;
  }

  @Post('passage')
  async tagPassage(
    @Req() req: AuthedRequest,
    @Body() dto: TagPassageDto,
  ): Promise<Tag[]> {
    const { name, ...passage } = dto;
    const tags = await this.tags.tagPassage(req.user.id, passage, name);
    if (tags === 'invalid-name')
      throw new BadRequestException('invalid tag name');
    return tags;
  }

  @Delete('passage/:tagId')
  async untagPassage(
    @Req() req: AuthedRequest,
    @Param('tagId') tagId: string,
    @Query('translation') translationId?: string,
    @Query('book') book?: string,
    @Query('chapter') chapter?: string,
  ): Promise<Tag[]> {
    const passage = passageFromQuery(translationId, book, chapter);
    const tags = await this.tags.untagPassage(req.user.id, passage, tagId);
    if (!tags) throw new NotFoundException();
    return tags;
  }
}
