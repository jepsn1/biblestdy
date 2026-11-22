import { Module } from '@nestjs/common';
import { AnnotationsModule } from '../annotations/annotations.module';
import { HighlightsModule } from '../highlights/highlights.module';
import { NotesModule } from '../notes/notes.module';
import { TrashPurgeSchedule } from './purge.schedule';
import { TrashController } from './trash.controller';

/** Soft delete housekeeping (#64, #261): deleted study is listed under
 * Recently deleted and restorable for TRASH_DAYS, then purged. */
@Module({
  imports: [NotesModule, HighlightsModule, AnnotationsModule],
  controllers: [TrashController],
  providers: [TrashPurgeSchedule],
})
export class TrashModule {}
