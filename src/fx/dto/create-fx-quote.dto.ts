import { IsInt, IsString, Length, Matches, Min } from 'class-validator';

export class CreateFxQuoteDto {
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  source_currency!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  target_currency!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}
