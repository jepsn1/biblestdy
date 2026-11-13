import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { isReaderStyle, type Preferences } from '@biblestdy/shared';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesService } from './preferences.service';

@Controller('preferences')
@UseGuards(SessionGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  get(@Req() req: AuthedRequest): Promise<Preferences> {
    return this.preferences.get(req.user.id);
  }

  @Patch()
  async update(
    @Req() req: AuthedRequest,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<Preferences> {
    // ValidationPipe checks this too; guard again so the service never sees junk
    if (!isReaderStyle(dto.readerStyle)) {
      throw new BadRequestException('readerStyle must be paper or clean');
    }
    return this.preferences.setReaderStyle(req.user.id, dto.readerStyle);
  }
}
