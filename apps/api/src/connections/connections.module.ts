import { abbrFromProvider } from '../notes/chapter-scope';
import { ScriptureModule } from '../scripture/scripture.module';
import {
  SCRIPTURE_PROVIDER,
  type ScriptureProvider,
} from '../scripture/provider';
import { Module } from '@nestjs/common';
import { DrizzleNoteStore } from '../notes/notes.store';
import { DrizzleTagStore } from '../tags/tags.store';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
  imports: [ScriptureModule],
  controllers: [ConnectionsController],
  providers: [
    {
      provide: ConnectionsService,
      inject: [SCRIPTURE_PROVIDER],
      useFactory: (provider: ScriptureProvider) =>
        new ConnectionsService(
          new DrizzleNoteStore(),
          new DrizzleTagStore(),
          abbrFromProvider(provider),
        ),
    },
  ],
})
export class ConnectionsModule {}
