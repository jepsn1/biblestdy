import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AnnotationsModule } from './annotations/annotations.module';
import { HighlightsModule } from './highlights/highlights.module';
import { NotesModule } from './notes/notes.module';
import { ScriptureModule } from './scripture/scripture.module';

@Module({
  imports: [ScriptureModule, HighlightsModule, AnnotationsModule, NotesModule],
  controllers: [AppController],
})
export class AppModule {}
