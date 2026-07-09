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

export class CreateNoteDto extends AnchorDto {
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
