import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Payment, Prisma } from '@prisma/client';
import { PaymentStatus } from '../common/enums';
import { PaymentStateMachine } from '../common/payment-state-machine';
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
    await this.prisma.$transaction(
      async (tx) => {
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
      },
      // Settling a payment credits a balance and writes a ledger entry while
      // holding row locks; the 5s Prisma default is too tight under contention.
      { maxWait: 5_000, timeout: 15_000 },
    );
  }

  private async markPaid(
    tx: Prisma.TransactionClient,
    payment: Payment,
    payload: unknown,
  ) {
    if (
      !PaymentStateMachine.canTransition(payment.status, PaymentStatus.PAID)
    ) {
      this.logger.warn(
        `Ignored payment.paid for closed payment ${payment.id} (${payment.status})`,
      );
      return;
    }

    if (!this.payloadMatchesPayment(payment, payload)) {
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

    const providerTxId = settlementData(payload).provider_tx_id;

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

    await this.balances.creditPayment(tx, updated);
  }

  private async markStatus(
    tx: Prisma.TransactionClient,
    paymentId: string,
    status: PaymentStatus,
  ) {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });

    if (
      !payment ||
      !PaymentStateMachine.canTransition(payment.status, status)
    ) {
      return;
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: { status },
    });
  }

  /**
   * The provider tells us what it settled; we only credit what we charged. A
   * divergence is a reconciliation problem, so the payment stays open for a
   * corrected event instead of being credited or closed on a wrong figure.
   */
  private payloadMatchesPayment(payment: Payment, payload: unknown): boolean {
    const data = settlementData(payload);
    const amount =
      typeof data.amount === 'number' ? BigInt(data.amount) : undefined;
    const currency =
      typeof data.currency === 'string'
        ? data.currency.toUpperCase()
        : undefined;

    if (amount === payment.amount && currency === payment.currency) {
      return true;
    }

    this.logger.warn(
      `Settlement rejected for payment ${payment.id}: expected ` +
        `${payment.amount} ${payment.currency}, webhook reported ` +
        `${amount ?? 'none'} ${currency ?? 'none'} (1015)`,
    );

    return false;
  }
}

type SettlementData = {
  provider_tx_id?: string;
  amount?: number;
  currency?: string;
};

function settlementData(payload: unknown): SettlementData {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const data = (payload as { data?: unknown }).data;

  return typeof data === 'object' && data !== null ? data : {};
}
