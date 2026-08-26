import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

export const PROCESS_WEBHOOK_QUEUE = 'process-payment-webhook';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PROCESS_WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async acceptPaymentWebhook(dto: PaymentWebhookDto) {
    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.webhookEvent.create({
          data: {
            provider: dto.provider,
            eventId: dto.event_id,
            type: dto.type,
            payload: dto as unknown as Prisma.InputJsonValue,
            paymentId: dto.payment_id,
          },
        });

        await this.webhookQueue.add('process', {
          webhookEventId: created.id,
        });

        return created;
      });

      return {
        accepted: true,
        duplicate: false,
        event_id: event.id,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return {
          accepted: true,
          duplicate: true,
          error: {
            code: 1042,
            name: 'duplicate_event',
            message: 'Event already processed.',
            details: { event_id: dto.event_id },
          },
        };
      }
      throw error;
    }
  }
}
