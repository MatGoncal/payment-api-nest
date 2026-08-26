import { randomUUID } from 'node:crypto';
import { Payment } from '@prisma/client';
import { PaymentStatus } from '../../src/common/enums';
import { SplitsService } from '../../src/splits/splits.service';
import { createPartner, createPayment } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('splits are immutable once the payment is closed', () => {
  const db = withTestDb();

  let splits: SplitsService;

  beforeAll(() => {
    splits = new SplitsService(db.prisma);
  });

  async function paymentWithSplit(status: PaymentStatus) {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, {
      status,
      amount: 1500n,
    });

    await db.prisma.paymentSplit.create({
      data: {
        id: randomUUID(),
        paymentId: payment.id,
        party: 'seller',
        amount: 1500n,
      },
    });

    return { partner, payment };
  }

  function storedSplits(payment: Payment) {
    return db.prisma.paymentSplit.findMany({
      where: { paymentId: payment.id },
    });
  }

  it.each([
    PaymentStatus.PAID,
    PaymentStatus.EXPIRED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ])('refuses to rewrite splits of a %s payment', async (status) => {
    const { partner, payment } = await paymentWithSplit(status);

    await expect(
      splits.define(partner, payment.id, {
        splits: [
          { party: 'platform', amount: 750 },
          { party: 'seller', amount: 750 },
        ],
      }),
    ).rejects.toMatchObject({
      errorCode: 1015,
      errorName: 'settlement_failed',
      details: { status },
    });

    const lines = await storedSplits(payment);

    expect(lines).toHaveLength(1);
    expect(lines[0].party).toBe('seller');
    expect(lines[0].amount).toBe(1500n);
  });

  it('still lets an open payment define its splits', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    const result = await splits.define(partner, payment.id, {
      splits: [
        { party: 'platform', amount: 500 },
        { party: 'seller', amount: 1000 },
      ],
    });

    expect(result.splits).toHaveLength(2);
    expect(await storedSplits(payment)).toHaveLength(2);
  });
});
