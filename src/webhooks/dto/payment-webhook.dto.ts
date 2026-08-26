import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
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

/**
 * A settlement event must state what it settled: the processor refuses to
 * credit anything it cannot check against the stored charge. Other event types
 * carry no money, so their `data` may be empty.
 */
@ValidatorConstraint({ name: 'settlementDataPresent', async: false })
class SettlementDataPresent implements ValidatorConstraintInterface {
  validate(data: WebhookDataDto | undefined, args: ValidationArguments) {
    if ((args.object as PaymentWebhookDto).type !== 'payment.paid') {
      return true;
    }

    return (
      typeof data?.amount === 'number' && typeof data?.currency === 'string'
    );
  }

  defaultMessage() {
    return 'data.amount and data.currency are required for payment.paid';
  }
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
  @Validate(SettlementDataPresent)
  @Type(() => WebhookDataDto)
  data!: WebhookDataDto;
}
