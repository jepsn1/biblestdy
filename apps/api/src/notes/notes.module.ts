import { abbrFromProvider } from './chapter-scope';
import { ScriptureModule } from '../scripture/scripture.module';
import {
  SCRIPTURE_PROVIDER,
  type ScriptureProvider,
} from '../scripture/provider';
import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { DrizzleTagStore } from '../tags/tags.store';
import { DrizzleNoteStore } from './notes.store';

@Module({
  imports: [ScriptureModule],
  controllers: [NotesController],
  providers: [
    {
      provide: NotesService,
      inject: [SCRIPTURE_PROVIDER],
      useFactory: (provider: ScriptureProvider) =>
        new NotesService(
          new DrizzleNoteStore(),
          new DrizzleTagStore(),
          abbrFromProvider(provider),
        ),
    },
  ],
})
export class NotesModule {}
