import { Module } from '@nestjs/common';
import { DrizzleNoteStore } from '../notes/notes.store';
import { DrizzleTagStore } from '../tags/tags.store';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { DrizzleAccountStore } from './account.store';

@Module({
  controllers: [AccountController],
  providers: [
    {
      provide: AccountService,
      useFactory: () =>
        new AccountService(
          new DrizzleAccountStore(),
          new DrizzleNoteStore(),
          new DrizzleTagStore(),
        ),
    },
  ],
})
export class AccountModule {}
