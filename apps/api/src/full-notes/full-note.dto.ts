import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

const MAX_TITLE = 200;
const MAX_BODY = 100_000; // it's a document, but not a book

export class CreateFullNoteDto {
  @IsString()
  translationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY)
  body?: string;

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

export class UpdateFullNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BODY)
  body?: string;
}
