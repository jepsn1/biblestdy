import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { FullNotesModule } from './full-notes/full-notes.module';
import { HighlightsModule } from './highlights/highlights.module';
import { NotesModule } from './notes/notes.module';
import { ScriptureModule } from './scripture/scripture.module';

@Module({
  imports: [ScriptureModule, HighlightsModule, NotesModule, FullNotesModule],
  controllers: [AppController],
})
export class AppModule {}
