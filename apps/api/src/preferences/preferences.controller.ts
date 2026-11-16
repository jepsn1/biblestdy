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
  parseHighlightLabels,
  HIGHLIGHT_LABEL_MAX,
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

  /** GET /api/preferences/marked-translation (reader's default on a new
   * device; asked only when the device has no stored translation). */
  @Get('marked-translation')
  markedTranslation(
    @Req() req: AuthedRequest,
  ): Promise<{ translationId: string | null }> {
    return this.preferences.markedTranslation(req.user.id);
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
    if (dto.supportNoticeDismissed !== undefined) {
      if (dto.supportNoticeDismissed !== true) {
        throw new BadRequestException('supportNoticeDismissed must be true');
      }
      patch.supportNoticeDismissed = true;
    }
    if (dto.highlightLabels !== undefined) {
      const labels = parseHighlightLabels(dto.highlightLabels);
      if (!labels) {
        throw new BadRequestException(
          `highlightLabels must map highlight colours to names of at most ${HIGHLIGHT_LABEL_MAX} characters`,
        );
      }
      patch.highlightLabels = labels;
    }
    if (dto.singleKeyShortcuts !== undefined) {
      if (typeof dto.singleKeyShortcuts !== 'boolean') {
        throw new BadRequestException(
          'singleKeyShortcuts must be true or false',
        );
      }
      patch.singleKeyShortcuts = dto.singleKeyShortcuts;
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('nothing to update');
    }
    return this.preferences.update(req.user.id, patch);
  }
}
