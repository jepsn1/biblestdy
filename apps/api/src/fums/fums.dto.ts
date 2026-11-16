import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

/** Tokens of the chapters the reader just saw (a page can show two: a
 * chapter and the opening of the next). */
export class FumsViewsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  // API.Bible's tokens are url-safe base64; anything else isn't one
  @Matches(/^[\w-]{1,4096}$/, { each: true })
  tokens!: string[];
}
