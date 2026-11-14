import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Inline annotations are short — cap the length so full annotations (#7) stay the home for long-form. */
const MAX_INLINE = 500;
/** The marked words, plain text — long spans are clipped by the client. */
const MAX_QUOTE = 2000;

const MARKS = ['contour', 'underline', 'circle', 'bracket'] as const;
type AnnotationMarkValue = (typeof MARKS)[number];

export class CreateAnnotationDto {
  @IsString()
  @MinLength(1)
  translationId!: string;

  /** Absent/null = a plain pen mark, no margin text. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INLINE)
  text?: string | null;

  @IsOptional()
  @IsIn(MARKS)
  mark?: AnnotationMarkValue | null;

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

export class UpdateAnnotationDto {
  /** null removes the text: the annotation becomes a plain pen mark. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INLINE)
  text?: string | null;

  /** The marked words (lazy backfill for rows created before quotes). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUOTE)
  quote?: string;

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

  /** Pen style; null = auto (one line circled, several bracketed). */
  @IsOptional() // undefined or null = auto
  @IsIn(MARKS)
  mark?: AnnotationMarkValue | null;
}
