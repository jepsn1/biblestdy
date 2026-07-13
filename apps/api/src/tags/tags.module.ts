import { Module } from '@nestjs/common';
import { DrizzleNoteStore } from '../notes/notes.store';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { DrizzleTagStore } from './tags.store';

@Module({
  controllers: [TagsController],
  providers: [
    {
      provide: TagsService,
      useFactory: () =>
        new TagsService(new DrizzleTagStore(), new DrizzleNoteStore()),
    },
  ],
})
export class TagsModule {}
