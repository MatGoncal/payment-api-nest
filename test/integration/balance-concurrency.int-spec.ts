import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { BalancesService } from '../../src/balances/balances.service';
import { LedgerDirection, PayoutStatus } from '../../src/common/enums';
import { PayoutsService } from '../../src/payouts/payouts.service';
import {
  createPartner,
  createPayment,
  createPayout,
  fundBalance,
} from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

/** Prisma types `status` and `direction` as plain strings. */
function is(value: string, expected: PayoutStatus | LedgerDirection): boolean {
  return value === String(expected);
}

describe('balance concurrency', () => {
  const db = withTestDb();

  const queue = { add: jest.fn() } as unknown as Queue;

  let balances: BalancesService;
  let payouts: PayoutsService;

  beforeAll(() => {
    balances = new BalancesService(db.prisma);
    payouts = new PayoutsService(db.prisma, balances, queue);
  });

  it('lets only one of two simultaneous payouts through when the balance funds one', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 3000n);

    const first = await createPayout(db.prisma, partner, { amount: 2500n });
    const second = await createPayout(db.prisma, partner, { amount: 2500n });

    await Promise.all([payouts.process(first.id), payouts.process(second.id)]);

    const settled = await db.prisma.payout.findMany();
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(
      settled.filter((payout) => is(payout.status, PayoutStatus.COMPLETED)),
    ).toHaveLength(1);
    expect(
      settled.filter((payout) => is(payout.status, PayoutStatus.FAILED)),
    ).toHaveLength(1);
    expect(
      settled.find((payout) => is(payout.status, PayoutStatus.FAILED))
        ?.failureCode,
    ).toBe('1027');

    expect(balance.available).toBe(500n);
    expect(
      await db.prisma.balanceLedger.count({
        where: { direction: LedgerDirection.DEBIT },
      }),
    ).toBe(1);
  });

  it('never overdraws when many payouts race for the same balance', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 3000n);

    // Eight payouts of 1000 against 3000 of funding: at most three can win.
    const queued = await Promise.all(
      Array.from({ length: 8 }, () =>
        createPayout(db.prisma, partner, { amount: 1000n }),
      ),
    );

    await Promise.all(queued.map((payout) => payouts.process(payout.id)));

    const settled = await db.prisma.payout.findMany();
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });
    const debits = await db.prisma.balanceLedger.findMany({
      where: { direction: LedgerDirection.DEBIT },
    });

    expect(balance.available).toBe(0n);
    expect(
      settled.filter((payout) => is(payout.status, PayoutStatus.COMPLETED)),
    ).toHaveLength(3);
    expect(
      settled.filter((payout) => is(payout.status, PayoutStatus.FAILED)),
    ).toHaveLength(5);
    expect(debits).toHaveLength(3);
    expect(debits.map((entry) => entry.balanceAfter).sort()).toEqual([
      0n,
      1000n,
      2000n,
    ]);
  });

  it('keeps the ledger and the balance in agreement under mixed traffic', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);

    const queued = await Promise.all(
      Array.from({ length: 5 }, () =>
        createPayout(db.prisma, partner, { amount: 600n }),
      ),
    );
    const payments = await Promise.all(
      Array.from({ length: 5 }, () =>
        createPayment(db.prisma, partner, { amount: 400n }),
      ),
    );

    await Promise.all([
      ...queued.map((payout) => payouts.process(payout.id)),
      ...payments.map((payment) =>
        db.prisma.$transaction((tx) => balances.creditPayment(tx, payment)),
      ),
    ]);

    const entries = await db.prisma.balanceLedger.findMany();
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    const credited = entries
      .filter((entry) => is(entry.direction, LedgerDirection.CREDIT))
      .reduce((sum, entry) => sum + entry.amount, 0n);
    const debited = entries
      .filter((entry) => is(entry.direction, LedgerDirection.DEBIT))
      .reduce((sum, entry) => sum + entry.amount, 0n);

    // Every entry must have moved money exactly once, so the balance is the
    // funding plus credits minus debits — no lost update in either direction.
    expect(entries).toHaveLength(10);
    expect(credited).toBe(2000n);
    expect(debited).toBe(3000n);
    expect(balance.available).toBe(5000n + credited - debited);
  });

  it('credits a payment once even when two workers settle it at the same time', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    await Promise.all(
      Array.from({ length: 3 }, () =>
        db.prisma.$transaction((tx) => balances.creditPayment(tx, payment)),
      ),
    );

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(1500n);
    expect(await db.prisma.balanceLedger.count()).toBe(1);
  });

  it('creates the balance row once when concurrent credits arrive first', async () => {
    const partner = await createPartner(db.prisma);
    const payments = await Promise.all(
      Array.from({ length: 4 }, () =>
        createPayment(db.prisma, partner, { amount: 250n }),
      ),
    );

    await Promise.all(
      payments.map((payment) =>
        db.prisma.$transaction((tx) => balances.creditPayment(tx, payment)),
      ),
    );

    const rows = await db.prisma.partnerBalance.findMany({
      where: { partnerId: partner.id },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].available).toBe(1000n);
  });

  it('reports an unused reference so callers can tell it apart', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 1000n);

    const reference = randomUUID();

    const balance = await db.prisma.$transaction((tx) =>
      balances.debit(
        tx,
        partner.id,
        'BRL',
        400n,
        'payout',
        reference,
        'First debit',
      ),
    );

    expect(balance.available).toBe(600n);
  });
});
