import { Module } from '@nestjs/common';
import { FullNotesController } from './full-notes.controller';
import { FullNotesService } from './full-notes.service';

@Module({
  controllers: [FullNotesController],
  providers: [FullNotesService],
})
export class FullNotesModule {}
