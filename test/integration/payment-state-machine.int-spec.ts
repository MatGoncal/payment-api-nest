import { Job } from 'bullmq';
import { Payment, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BalancesService } from '../../src/balances/balances.service';
import { PaymentStatus } from '../../src/common/enums';
import { SplitsService } from '../../src/splits/splits.service';
import { ProcessPaymentWebhookProcessor } from '../../src/webhooks/process-payment-webhook.processor';
import { createPartner, createPayment } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('payment state machine at settlement', () => {
  const db = withTestDb();

  let processor: ProcessPaymentWebhookProcessor;

  beforeAll(() => {
    processor = new ProcessPaymentWebhookProcessor(
      db.prisma,
      new BalancesService(db.prisma),
      new SplitsService(db.prisma),
    );
  });

  async function deliver(
    payment: Payment,
    type: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    const event = await db.prisma.webhookEvent.create({
      data: {
        id: randomUUID(),
        provider: 'fake_pix',
        eventId: `evt_${randomUUID()}`,
        type,
        payload: { type, data } as Prisma.InputJsonValue,
        paymentId: payment.id,
      },
    });

    await processor.process({
      data: { webhookEventId: event.id },
    } as Job<{ webhookEventId: string }>);
  }

  function settlement(
    payment: Payment,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      provider_tx_id: 'pix_tx_1',
      amount: Number(payment.amount),
      currency: payment.currency,
      ...overrides,
    };
  }

  it('does not settle a payment that already expired', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, {
      status: PaymentStatus.EXPIRED,
    });

    await deliver(payment, 'payment.paid', settlement(payment));

    const stored = await db.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    expect(stored.status).toBe(PaymentStatus.EXPIRED);
    expect(stored.paidAt).toBeNull();
    expect(await db.prisma.balanceLedger.count()).toBe(0);
    expect(await db.prisma.partnerBalance.count()).toBe(0);
  });

  it('does not reopen a failed payment', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, {
      status: PaymentStatus.FAILED,
    });

    await deliver(payment, 'payment.paid', settlement(payment));

    const stored = await db.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    expect(stored.status).toBe(PaymentStatus.FAILED);
    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });

  it('keeps a paid payment on a late expiry event', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, {
      status: PaymentStatus.PAID,
    });

    await deliver(payment, 'payment.expired');

    const stored = await db.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    expect(stored.status).toBe(PaymentStatus.PAID);
  });

  it('refuses to credit a settlement whose amount does not match the charge', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    await deliver(
      payment,
      'payment.paid',
      settlement(payment, { amount: 9900 }),
    );

    const stored = await db.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    // The charge stays open: a corrected event must still be able to settle it.
    expect(stored.status).toBe(PaymentStatus.PENDING);
    expect(stored.paidAt).toBeNull();
    expect(await db.prisma.balanceLedger.count()).toBe(0);
    expect(await db.prisma.partnerBalance.count()).toBe(0);
  });

  it('refuses to credit a settlement in another currency', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner);

    await deliver(
      payment,
      'payment.paid',
      settlement(payment, { currency: 'USD' }),
    );

    const stored = await db.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    expect(stored.status).toBe(PaymentStatus.PENDING);
    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });

  it('settles and credits when the payload matches the charge', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 2500n });

    await deliver(payment, 'payment.paid', settlement(payment));

    const stored = await db.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(stored.status).toBe(PaymentStatus.PAID);
    expect(stored.providerTxId).toBe('pix_tx_1');
    expect(balance.available).toBe(2500n);
    expect(await db.prisma.balanceLedger.count()).toBe(1);
  });
});
