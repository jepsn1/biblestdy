import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { HighlightsModule } from './highlights/highlights.module';
import { ScriptureModule } from './scripture/scripture.module';

@Module({
  imports: [ScriptureModule, HighlightsModule],
  controllers: [AppController],
})
export class AppModule {}
