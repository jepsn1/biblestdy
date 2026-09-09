import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AccountModule } from './account/account.module';
import { AnnotationsModule } from './annotations/annotations.module';
import { ConnectionsModule } from './connections/connections.module';
import { HighlightsModule } from './highlights/highlights.module';
import { NotesModule } from './notes/notes.module';
import { ScriptureModule } from './scripture/scripture.module';
import { TagsModule } from './tags/tags.module';

@Module({
  imports: [
    AccountModule,
    ScriptureModule,
    HighlightsModule,
    AnnotationsModule,
    NotesModule,
    ConnectionsModule,
    TagsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
