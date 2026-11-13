import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  isReaderStyle,
  isTextSize,
  type Preferences,
  type PreferencesPatch,
} from '@biblestdy/shared';
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
    const patch: PreferencesPatch = {};
    if (dto.readerStyle !== undefined) {
      if (!isReaderStyle(dto.readerStyle)) {
        throw new BadRequestException('readerStyle must be paper or clean');
      }
      patch.readerStyle = dto.readerStyle;
    }
    if (dto.textSize !== undefined) {
      if (!isTextSize(dto.textSize)) {
        throw new BadRequestException(
          'textSize must be 100, 125, 150, 175 or 200',
        );
      }
      patch.textSize = dto.textSize;
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('nothing to update');
    }
    return this.preferences.update(req.user.id, patch);
  }
}
