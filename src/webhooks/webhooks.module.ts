import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BalancesModule } from '../balances/balances.module';
import { SplitsModule } from '../splits/splits.module';
import { ProcessPaymentWebhookProcessor } from './process-payment-webhook.processor';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { PROCESS_WEBHOOK_QUEUE, WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    BalancesModule,
    SplitsModule,
    BullModule.registerQueue({ name: PROCESS_WEBHOOK_QUEUE }),
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookSignatureGuard,
    ProcessPaymentWebhookProcessor,
  ],
})
export class WebhooksModule {}
