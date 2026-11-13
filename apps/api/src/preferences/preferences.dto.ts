import { READER_STYLES, type ReaderStyle } from '@biblestdy/shared';
import { IsIn } from 'class-validator';

export class UpdatePreferencesDto {
  @IsIn(READER_STYLES)
  readerStyle!: ReaderStyle;
}
