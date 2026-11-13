import { Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';
import { DrizzlePreferencesStore } from './preferences.store';

@Module({
  controllers: [PreferencesController],
  providers: [
    {
      provide: PreferencesService,
      useFactory: () => new PreferencesService(new DrizzlePreferencesStore()),
    },
  ],
})
export class PreferencesModule {}
