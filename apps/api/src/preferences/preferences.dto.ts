import {
  READER_STYLES,
  TEXT_SIZES,
  type ReaderStyle,
  type TextSize,
} from '@biblestdy/shared';
import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';

/** Any subset of the preferences; the controller requires at least one. */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(READER_STYLES)
  readerStyle?: ReaderStyle;

  @IsOptional()
  @IsIn(TEXT_SIZES)
  textSize?: TextSize;

  /** Shape/length checked by parseHighlightLabels in the controller. */
  @IsOptional()
  @IsObject()
  highlightLabels?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  singleKeyShortcuts?: boolean;
}
