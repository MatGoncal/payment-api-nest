import { Queue, Worker } from 'bullmq';
import { BalancesService } from '../../src/balances/balances.service';
import { PayoutStatus } from '../../src/common/enums';
import { MONEY_JOB_OPTIONS } from '../../src/common/queue.config';
import { PayoutsService, payoutJobId } from '../../src/payouts/payouts.service';
import { createPartner, createPayout, fundBalance } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

const QUEUE_NAME = 'integration-money-queue';

describe('money queues survive a transient failure', () => {
  const db = withTestDb();

  let queue: Queue;

  beforeAll(() => {
    queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: MONEY_JOB_OPTIONS,
    });
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('stamps the resilient defaults on every job', async () => {
    const job = await queue.add('process', { payoutId: 'p-1' });

    expect(job.opts.attempts).toBe(5);
    expect(job.opts.backoff).toEqual({ type: 'exponential', delay: 5_000 });
    expect(job.opts.removeOnFail).toBe(false);
  });

  it('collapses a repeated enqueue of the same payout into one job', async () => {
    const jobId = payoutJobId('770e8400-e29b-41d4-a716-446655440000');

    await queue.add('process', { payoutId: 'p-2' }, { jobId });
    await queue.add('process', { payoutId: 'p-2' }, { jobId });

    expect(await queue.getJobCountByTypes('waiting')).toBe(1);
  });

  it('retries a failing job until the attempts run out, then keeps it', async () => {
    let attempts = 0;

    const worker = new Worker(
      QUEUE_NAME,
      () => {
        attempts += 1;
        return Promise.reject(new Error('provider unreachable'));
      },
      { connection },
    );

    // The production backoff is exponential from five seconds; the delay is not
    // what this test is about, so it is shortened to keep the run quick.
    const job = await queue.add(
      'process',
      { payoutId: 'p-3' },
      { backoff: { type: 'fixed', delay: 10 } },
    );

    const exhausted = new Promise<void>((resolve) => {
      worker.on('failed', (failed) => {
        if (failed?.attemptsMade === MONEY_JOB_OPTIONS.attempts) {
          resolve();
        }
      });
    });

    await exhausted;
    await worker.close();

    expect(attempts).toBe(5);
    expect(await job.getState()).toBe('failed');
    expect(await queue.getJobCountByTypes('failed')).toBe(1);
  });

  it('debits once when the same payout is processed twice', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);
    const payout = await createPayout(db.prisma, partner, { amount: 2000n });

    const payouts = new PayoutsService(
      db.prisma,
      new BalancesService(db.prisma),
      queue,
    );

    // A worker can pick the same job up twice: after a crash between the debit
    // and the ack, or when a duplicate was enqueued.
    await payouts.process(payout.id);
    await payouts.process(payout.id);

    const settled = await db.prisma.payout.findUniqueOrThrow({
      where: { id: payout.id },
    });
    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });

    expect(settled.status).toBe(PayoutStatus.COMPLETED);
    expect(balance.available).toBe(3000n);
    expect(await db.prisma.balanceLedger.count()).toBe(1);
  });
});
