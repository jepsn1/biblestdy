import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Inline notes are short — cap the length so full notes (#7) stay the home for long-form. */
const MAX_INLINE = 500;

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  translationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INLINE)
  text!: string;

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

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INLINE)
  text?: string;

  /** Dragged position, offset from the anchored words' center (px). */
  @IsOptional()
  @IsNumber()
  offsetX?: number;

  @IsOptional()
  @IsNumber()
  offsetY?: number;

  /** User-resized box width (px). */
  @IsOptional()
  @IsNumber()
  @Min(90)
  @Max(600)
  width?: number;
}
