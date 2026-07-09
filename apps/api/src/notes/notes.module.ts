import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { DrizzleNoteStore } from './notes.store';

@Module({
  controllers: [NotesController],
  providers: [
    {
      provide: NotesService,
      useFactory: () => new NotesService(new DrizzleNoteStore()),
    },
  ],
})
export class NotesModule {}
