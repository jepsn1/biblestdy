import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class TagNameDto {
  @IsString()
  @MaxLength(80) // normalized + checked again in the service
  name!: string;
}

export class TagPassageDto extends TagNameDto {
  @IsString()
  translationId!: string;

  @IsString()
  book!: string;

  @IsInt()
  @Min(1)
  chapter!: number;
}
