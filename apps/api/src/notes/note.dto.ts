import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

const MAX_TITLE = 200;
const MAX_BODY = 100_000; // it's a document, but not a book

/** A word-span anchor on the wire (see Anchor in @biblestdy/shared). */
export class AnchorDto {
  @IsString()
  translationId!: string;

  @IsString()
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

/** A note made from a selection carries its first anchor; one written on the
 * Notes page carries none. All seven or none — the controller refuses half. */
export class CreateNoteDto {
  @IsOptional()
  @IsString()
  translationId?: string;

  @IsOptional()
  @IsString()
  book?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  chapter?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  startVerse?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  startWord?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  endVerse?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  endWord?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY)
  body?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY)
  body?: string;
}
