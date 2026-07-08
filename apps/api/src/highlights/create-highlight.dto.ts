import { IsInt, IsString, Min, MinLength } from 'class-validator';

/** Request body for creating a highlight — a word-span anchor. */
export class CreateHighlightDto {
  @IsString()
  @MinLength(1)
  translationId!: string;

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
