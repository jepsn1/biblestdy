import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { DrizzleTagStore } from '../tags/tags.store';
import { DrizzleNoteStore } from './notes.store';

@Module({
  controllers: [NotesController],
  providers: [
    {
      provide: NotesService,
      useFactory: () =>
        new NotesService(new DrizzleNoteStore(), new DrizzleTagStore()),
    },
  ],
})
export class NotesModule {}
