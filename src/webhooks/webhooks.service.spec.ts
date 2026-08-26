import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROCESS_WEBHOOK_QUEUE, WebhooksService } from './webhooks.service';

describe('WebhooksService idempotency', () => {
  let service: WebhooksService;

  const prisma = {
    $transaction: jest.fn(),
    webhookEvent: {
      create: jest.fn(),
    },
  };

  const queue = { add: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(PROCESS_WEBHOOK_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  it('returns duplicate + 1042 on unique violation', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.acceptPaymentWebhook({
      event_id: 'evt_1',
      provider: 'fake_pix',
      type: 'payment.paid',
      payment_id: '550e8400-e29b-41d4-a716-446655440000',
      occurred_at: new Date().toISOString(),
      data: { amount: 1500, currency: 'BRL' },
    });

    expect(result.duplicate).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.error?.code).toBe(1042);
    expect(result.error?.name).toBe('duplicate_event');
  });

  it('enqueues job on first delivery', async () => {
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        webhookEvent: {
          create: jest.fn().mockResolvedValue({ id: 'wh-1' }),
        },
      }),
    );

    const result = await service.acceptPaymentWebhook({
      event_id: 'evt_new',
      provider: 'fake_pix',
      type: 'payment.paid',
      payment_id: '550e8400-e29b-41d4-a716-446655440000',
      occurred_at: new Date().toISOString(),
      data: {},
    });

    expect(result.duplicate).toBe(false);
    expect(result.accepted).toBe(true);
    expect(queue.add).toHaveBeenCalledWith('process', {
      webhookEventId: 'wh-1',
    });
  });
});
