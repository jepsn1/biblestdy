import { Module } from '@nestjs/common';
import { DrizzleNoteStore } from '../notes/notes.store';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
  controllers: [ConnectionsController],
  providers: [
    {
      provide: ConnectionsService,
      useFactory: () => new ConnectionsService(new DrizzleNoteStore()),
    },
  ],
})
export class ConnectionsModule {}
