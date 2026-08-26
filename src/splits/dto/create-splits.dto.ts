import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SplitLineDto {
  @IsIn(['platform', 'seller', 'affiliate'])
  party!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}

export class CreateSplitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitLineDto)
  splits!: SplitLineDto[];
}

export class PaymentIdParam {
  @IsUUID()
  id!: string;
}
