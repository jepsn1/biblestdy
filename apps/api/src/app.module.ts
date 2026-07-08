import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ScriptureModule } from './scripture/scripture.module';

@Module({
  imports: [ScriptureModule],
  controllers: [AppController],
})
export class AppModule {}
