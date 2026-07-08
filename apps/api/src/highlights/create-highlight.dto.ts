import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import { HIGHLIGHT_COLORS, type HighlightColor } from '@biblestdy/shared';

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
}
