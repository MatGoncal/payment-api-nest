import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @Length(3, 3)
  @Matches(/^BRL$/)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  external_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  expires_in_seconds?: number;
}
