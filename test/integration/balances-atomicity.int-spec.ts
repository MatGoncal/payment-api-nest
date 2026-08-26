import { Queue } from 'bullmq';
import { BalancesService } from '../../src/balances/balances.service';
import { PayoutStatus } from '../../src/common/enums';
import { PayoutsService } from '../../src/payouts/payouts.service';
import {
  createPartner,
  createPayment,
  createPayout,
  fundBalance,
} from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('balance writes join the caller transaction', () => {
  const db = withTestDb();

  const queue = { add: jest.fn() } as unknown as Queue;

  let balances: BalancesService;
  let payouts: PayoutsService;

  beforeAll(() => {
    balances = new BalancesService(db.prisma);
    payouts = new PayoutsService(db.prisma, balances, queue);
  });

  it('rolls a settlement credit back when the surrounding transaction fails', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 2500n });

    await expect(
      db.prisma.$transaction(async (tx) => {
        await balances.creditPayment(tx, payment);

        throw new Error('webhook processing failed after the credit');
      }),
    ).rejects.toThrow('webhook processing failed after the credit');

    // A nested `$transaction` inside creditPayment would have committed the
    // money on its own, leaving a credit for a payment that never settled.
    expect(await db.prisma.balanceLedger.count()).toBe(0);
    expect(await db.prisma.partnerBalance.count()).toBe(0);
  });

  it('rolls a payout debit back when the surrounding transaction fails', async () => {
    const partner = await createPartner(db.prisma);
    const payout = await createPayout(db.prisma, partner, { amount: 1000n });
    await fundBalance(db.prisma, partner, 5000n);

    await expect(
      db.prisma.$transaction(async (tx) => {
        await balances.debit(
          tx,
          partner.id,
          'BRL',
          payout.amount,
          'payout',
          payout.id,
          'Payout debit on confirm',
        );

        throw new Error('payout bookkeeping failed after the debit');
      }),
    ).rejects.toThrow('payout bookkeeping failed after the debit');

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(5000n);
    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });

  it('commits the payout and its debit together', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);
    const payout = await createPayout(db.prisma, partner, { amount: 2000n });

    await payouts.process(payout.id);

    const settled = await db.prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });
    const entries = await db.prisma.balanceLedger.findMany();

    expect(settled.status).toBe(PayoutStatus.COMPLETED);
    expect(balance.available).toBe(3000n);
    expect(entries).toHaveLength(1);
    expect(entries[0].direction).toBe('debit');
    expect(entries[0].balanceAfter).toBe(3000n);
  });

  it('fails the payout without moving money when funds are short', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 500n);
    const payout = await createPayout(db.prisma, partner, { amount: 2000n });

    await payouts.process(payout.id);

    const settled = await db.prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(settled.status).toBe(PayoutStatus.FAILED);
    expect(settled.failureCode).toBe('1027');
    expect(balance.available).toBe(500n);
    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });
});
