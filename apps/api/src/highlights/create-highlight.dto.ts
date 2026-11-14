import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { HIGHLIGHT_COLORS, type HighlightColor } from '@biblestdy/shared';

/** The marked words, plain text — long spans are clipped by the client. */
export const MAX_QUOTE = 2000;

/** Request body for creating a highlight — a word-span anchor + color. */
export class CreateHighlightDto {
  @IsString()
  @MinLength(1)
  translationId!: string;

  @IsIn(HIGHLIGHT_COLORS)
  color!: HighlightColor;

  @IsString()
  @MinLength(1)
  book!: string;

  @IsInt()
  @Min(1)
  chapter!: number;

  @IsInt()
  @Min(1)
  startVerse!: number;

  @IsInt()
  @Min(0)
  startWord!: number;

  @IsInt()
  @Min(1)
  endVerse!: number;

  @IsInt()
  @Min(0)
  endWord!: number;

  /** The marked words (palette search). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUOTE)
  quote?: string;
}

/** Request body for changing a highlight's color and/or storing its marked
 * words (lazy backfill). The span never moves. */
export class UpdateHighlightDto {
  @IsOptional()
  @IsIn(HIGHLIGHT_COLORS)
  color?: HighlightColor;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUOTE)
  quote?: string;
}
