import { Queue } from 'bullmq';
import { BalancesService } from '../../src/balances/balances.service';
import { DomainException } from '../../src/common/exceptions/domain.exception';
import { LedgerDirection, PayoutStatus } from '../../src/common/enums';
import { PayoutsService } from '../../src/payouts/payouts.service';
import { createPartner, createPayment, fundBalance } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('payout pending hold', () => {
  const db = withTestDb();
  const queue = { add: jest.fn() } as unknown as Queue;

  let balances: BalancesService;
  let payouts: PayoutsService;

  beforeAll(() => {
    balances = new BalancesService(db.prisma);
    payouts = new PayoutsService(db.prisma, balances, queue);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reserves available into pending on create without a ledger debit', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);

    const created = await payouts.create(partner, {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'hold@acme.test' },
      external_id: 'payout-hold',
    });

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(created.status).toBe('QUEUED');
    expect(balance.available).toBe(2500n);
    expect(balance.pending).toBe(2500n);
    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });

  it('confirms a reserved payout by debiting pending and writing the ledger once', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);

    const created = await payouts.create(partner, {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'confirm@acme.test' },
    });

    await payouts.process(created.id);

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });
    const settled = await db.prisma.payout.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(settled.status).toBe(PayoutStatus.COMPLETED);
    expect(balance.available).toBe(2500n);
    expect(balance.pending).toBe(0n);
    expect(
      await db.prisma.balanceLedger.count({
        where: { referenceType: 'payout' },
      }),
    ).toBe(1);
  });

  it('returns pending to available when the payout job hits a domain failure', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);

    const created = await payouts.create(partner, {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'fail@acme.test' },
    });

    jest
      .spyOn(balances, 'confirmDebit')
      .mockRejectedValueOnce(
        new DomainException(
          1015,
          'settlement_failed',
          'Payout rejected by provider.',
        ),
      );

    await payouts.process(created.id);

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });
    const settled = await db.prisma.payout.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(settled.status).toBe(PayoutStatus.FAILED);
    expect(settled.failureCode).toBe('1015');
    expect(balance.available).toBe(5000n);
    expect(balance.pending).toBe(0n);
    expect(await db.prisma.balanceLedger.count()).toBe(0);
  });

  it('does not move pending again when the payout job is replayed', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);

    const created = await payouts.create(partner, {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'replay@acme.test' },
    });

    await payouts.process(created.id);

    await db.prisma.payout.update({
      where: { id: created.id },
      data: { status: PayoutStatus.QUEUED, completedAt: null },
    });

    await payouts.process(created.id);

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(2500n);
    expect(balance.pending).toBe(0n);
    expect(
      await db.prisma.balanceLedger.count({
        where: { direction: LedgerDirection.DEBIT },
      }),
    ).toBe(1);
  });

  it('does not touch pending when a PIX payment is paid', async () => {
    const partner = await createPartner(db.prisma);
    const payment = await createPayment(db.prisma, partner, { amount: 1500n });

    await db.prisma.$transaction((tx) => balances.creditPayment(tx, payment));

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(balance.available).toBe(1500n);
    expect(balance.pending).toBe(0n);
  });
});
