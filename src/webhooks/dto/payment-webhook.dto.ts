import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class WebhookDataDto {
  @IsOptional()
  @IsString()
  provider_tx_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class PaymentWebhookDto {
  @IsString()
  event_id!: string;

  @IsString()
  provider!: string;

  @IsIn(['payment.paid', 'payment.expired', 'payment.failed'])
  type!: string;

  @IsUUID()
  payment_id!: string;

  @IsDateString()
  occurred_at!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WebhookDataDto)
  data!: WebhookDataDto;
}
