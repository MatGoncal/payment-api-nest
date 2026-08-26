import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiSecurity('WebhookSignature')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('payment')
  @UseGuards(WebhookSignatureGuard)
  payment(@Body() dto: PaymentWebhookDto) {
    return this.webhooksService.acceptPaymentWebhook(dto);
  }
}
