import { randomUUID } from 'node:crypto';
import { BalancesService } from '../../src/balances/balances.service';
import { LedgerDirection } from '../../src/common/enums';
import { createPartner, createPayment, fundBalance } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('ledger idempotency', () => {
  const db = withTestDb();

  let balances: BalancesService;

  beforeAll(() => {
    balances = new BalancesService(db.prisma);
  });

  it('credits a payment only once no matter how often it is replayed', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await db.prisma.$transaction((tx) => balances.creditPayment(tx, payment));
    }

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(1500n);
    expect(await db.prisma.balanceLedger.count()).toBe(1);
  });

  it('records the balance the entry actually produced', async () => {
    const partner = await createPartner(db.prisma);
    const first = await createPayment(db.prisma, partner, { amount: 1000n });
    const second = await createPayment(db.prisma, partner, { amount: 250n });

    await db.prisma.$transaction((tx) => balances.creditPayment(tx, first));
    await db.prisma.$transaction((tx) => balances.creditPayment(tx, second));

    const entries = await db.prisma.balanceLedger.findMany({
      orderBy: { createdAt: 'asc' },
    });

    expect(entries.map((entry) => entry.balanceAfter)).toEqual([1000n, 1250n]);
  });

  it('debits the same payout only once when the job is retried', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);
    const payoutId = randomUUID();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await db.prisma.$transaction((tx) =>
        balances.debit(
          tx,
          partner.id,
          'BRL',
          2000n,
          'payout',
          payoutId,
          'Payout debit on confirm',
        ),
      );
    }

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(3000n);
    expect(await db.prisma.balanceLedger.count()).toBe(1);
  });

  it('treats a credit and a debit on the same reference as distinct entries', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    await db.prisma.$transaction((tx) => balances.creditPayment(tx, payment));
    await db.prisma.$transaction((tx) =>
      balances.debit(
        tx,
        partner.id,
        'BRL',
        1500n,
        'payment',
        payment.id,
        'Chargeback',
      ),
    );

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(0n);
    expect(await db.prisma.balanceLedger.count()).toBe(2);
  });

  it('rejects a duplicate ledger row written straight to the database', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    await db.prisma.$transaction((tx) => balances.creditPayment(tx, payment));

    await expect(
      db.prisma.balanceLedger.create({
        data: {
          id: randomUUID(),
          partnerId: partner.id,
          currency: 'BRL',
          direction: LedgerDirection.CREDIT,
          amount: 1500n,
          balanceAfter: 3000n,
          referenceType: 'payment',
          referenceId: payment.id,
          description: 'Smuggled second credit',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('leaves no ledger entry behind when a debit is refused', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 500n);
    const payoutId = randomUUID();

    await expect(
      db.prisma.$transaction((tx) =>
        balances.debit(
          tx,
          partner.id,
          'BRL',
          2000n,
          'payout',
          payoutId,
          'Payout debit on confirm',
        ),
      ),
    ).rejects.toMatchObject({ errorCode: 1027 });

    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });
});
