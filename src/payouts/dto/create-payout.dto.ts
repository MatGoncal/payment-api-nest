import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PayoutDestinationDto {
  @IsString()
  @IsIn(['pix_key'])
  type!: string;

  @IsString()
  value!: string;
}

export class CreatePayoutDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ValidateNested()
  @Type(() => PayoutDestinationDto)
  destination!: PayoutDestinationDto;

  @IsOptional()
  @IsString()
  external_id?: string;
}
