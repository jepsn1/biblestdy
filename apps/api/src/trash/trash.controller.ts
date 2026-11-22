import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { TrashList } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { AnnotationsService } from '../annotations/annotations.service';
import { HighlightsService } from '../highlights/highlights.service';
import { NotesService } from '../notes/notes.service';

/** Recently deleted (#261): what the user deleted in the last TRASH_DAYS,
 * restorable through each item's own POST …/:id/restore. */
@Controller('trash')
@UseGuards(SessionGuard)
export class TrashController {
  constructor(
    private readonly notes: NotesService,
    private readonly highlights: HighlightsService,
    private readonly annotations: AnnotationsService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest): Promise<TrashList> {
    const id = req.user.id;
    const [notes, highlights, annotations] = await Promise.all([
      this.notes.listDeleted(id),
      this.highlights.listDeleted(id),
      this.annotations.listDeleted(id),
    ]);
    return { notes, highlights, annotations };
  }
}
