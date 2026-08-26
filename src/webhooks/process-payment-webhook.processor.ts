import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentStatus } from '../common/enums';
import { DomainException } from '../common/exceptions/domain.exception';
import { BalancesService } from '../balances/balances.service';
import { PrismaService } from '../prisma/prisma.service';
import { SplitsService } from '../splits/splits.service';
import { PROCESS_WEBHOOK_QUEUE } from './webhooks.service';

@Processor(PROCESS_WEBHOOK_QUEUE)
export class ProcessPaymentWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(ProcessPaymentWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
    private readonly splits: SplitsService,
  ) {
    super();
  }

  async process(job: Job<{ webhookEventId: string }>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.webhookEvent.findUnique({
        where: { id: job.data.webhookEventId },
      });

      if (!event || event.processedAt) {
        return;
      }

      const payment = event.paymentId
        ? await tx.payment.findUnique({ where: { id: event.paymentId } })
        : null;

      if (payment) {
        switch (event.type) {
          case 'payment.paid':
            await this.markPaid(tx, payment, event.payload);
            break;
          case 'payment.expired':
            await this.markStatus(tx, payment.id, PaymentStatus.EXPIRED);
            break;
          case 'payment.failed':
            await this.markStatus(tx, payment.id, PaymentStatus.FAILED);
            break;
        }
      }

      await tx.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    });
  }

  private async markPaid(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    payment: NonNullable<
      Awaited<ReturnType<PrismaService['payment']['findUnique']>>
    >,
    payload: unknown,
  ) {
    if (payment.status === 'PAID') {
      return;
    }

    try {
      await this.splits.assertValidForSettlement(payment);
    } catch (error) {
      if (error instanceof DomainException) {
        this.logger.warn(`Settlement failed for payment ${payment.id}`);
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        return;
      }
      throw error;
    }

    const data =
      typeof payload === 'object' && payload !== null
        ? (payload as { data?: { provider_tx_id?: string } }).data
        : undefined;
    const providerTxId = data?.provider_tx_id;

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        providerTxId:
          typeof providerTxId === 'string'
            ? providerTxId
            : payment.providerTxId,
      },
    });

    await this.balances.creditPayment(updated);
  }

  private async markStatus(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    paymentId: string,
    status: PaymentStatus,
  ) {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status === 'PAID') {
      return;
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: { status },
    });
  }
}
