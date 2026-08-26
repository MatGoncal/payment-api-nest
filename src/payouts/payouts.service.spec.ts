import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Partner } from '@prisma/client';
import { BalancesService } from '../balances/balances.service';
import { PrismaService } from '../prisma/prisma.service';
import { PROCESS_PAYOUT_QUEUE, PayoutsService } from './payouts.service';

describe('PayoutsService enqueueing', () => {
  const payout = {
    id: '770e8400-e29b-41d4-a716-446655440000',
    status: 'QUEUED',
    amount: 2500n,
    currency: 'BRL',
    externalId: 'payout-77',
    createdAt: new Date(),
  };

  const prisma = { payout: { create: jest.fn().mockResolvedValue(payout) } };
  const queue = { add: jest.fn() };

  let service: PayoutsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BalancesService, useValue: {} },
        { provide: getQueueToken(PROCESS_PAYOUT_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(PayoutsService);
  });

  it('enqueues the payout under a job id derived from the payout', async () => {
    await service.create({ id: 'partner-1' } as Partner, {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'synthetic@acme.test' },
      external_id: 'payout-77',
    });

    // A redelivered create must not put a second debit job on the queue.
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { payoutId: payout.id },
      { jobId: `payout-${payout.id}` },
    );
  });
});
