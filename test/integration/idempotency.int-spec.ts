import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { IdempotencyService } from '../../src/idempotency/idempotency.service';
import { FakePixProvider } from '../../src/payments/fake-pix.provider';
import { CreatePaymentDto } from '../../src/payments/dto/create-payment.dto';
import { PaymentsService } from '../../src/payments/payments.service';
import { PayoutsService } from '../../src/payouts/payouts.service';
import { BalancesService } from '../../src/balances/balances.service';
import { CreatePayoutDto } from '../../src/payouts/dto/create-payout.dto';
import { createPartner, fundBalance } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

const SYNTHETIC_QR = '00020126ACMEPAY.FAKE.PIX.BRL.1500.0.synthetic';

describe('idempotency keys', () => {
  const db = withTestDb();
  const queue = { add: jest.fn() } as unknown as Queue;

  let idempotency: IdempotencyService;
  let payments: PaymentsService;
  let payouts: PayoutsService;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 201,
      json: () =>
        Promise.resolve({
          qr_code: SYNTHETIC_QR,
          copy_paste: SYNTHETIC_QR,
        }),
    } as Response);

    idempotency = new IdempotencyService(db.prisma);
    payments = new PaymentsService(
      db.prisma,
      new FakePixProvider(
        new ConfigService({
          FAKE_PIX_BASE_URL: 'http://127.0.0.1:8080',
          FAKE_PIX_API_KEY: 'fake-pix-demo',
          FAKE_PIX_CALLBACK_URL: 'http://127.0.0.1:3001/v1/webhooks/payment',
        }),
      ),
    );
    payouts = new PayoutsService(
      db.prisma,
      new BalancesService(db.prisma),
      queue,
    );
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  beforeEach(() => {
    queue.add = jest.fn();
  });

  it('creates a payment without an Idempotency-Key', async () => {
    const partner = await createPartner(db.prisma);
    const dto = { amount: 1500, currency: 'BRL' } as CreatePaymentDto;

    const created = await idempotency.run({
      partnerId: partner.id,
      key: undefined,
      method: 'POST',
      path: '/v1/payments',
      rawBody: JSON.stringify(dto),
      execute: () => payments.create(partner, dto),
      responseCode: 201,
    });

    expect(created.status).toBe('PENDING');
    expect(created.amount).toBe(1500);
    expect(await db.prisma.payment.count()).toBe(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(0);
  });

  it('replays the same payment when the key and body match', async () => {
    const partner = await createPartner(db.prisma);
    const dto = {
      amount: 1500,
      currency: 'BRL',
      external_id: 'order-idem-1',
    } as CreatePaymentDto;
    const rawBody = JSON.stringify(dto);
    const params = {
      partnerId: partner.id,
      key: 'pay-1',
      method: 'POST',
      path: '/v1/payments',
      rawBody,
      execute: () => payments.create(partner, dto),
      responseCode: 201,
    };

    const first = await idempotency.run(params);
    const second = await idempotency.run(params);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('PENDING');
    expect(await db.prisma.payment.count()).toBe(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);
  });

  it('rejects the same key with a different body as 1043', async () => {
    const partner = await createPartner(db.prisma);
    const firstDto = { amount: 1500, currency: 'BRL' } as CreatePaymentDto;
    const secondDto = { amount: 2000, currency: 'BRL' } as CreatePaymentDto;

    await idempotency.run({
      partnerId: partner.id,
      key: 'pay-conflict',
      method: 'POST',
      path: '/v1/payments',
      rawBody: JSON.stringify(firstDto),
      execute: () => payments.create(partner, firstDto),
      responseCode: 201,
    });

    await expect(
      idempotency.run({
        partnerId: partner.id,
        key: 'pay-conflict',
        method: 'POST',
        path: '/v1/payments',
        rawBody: JSON.stringify(secondDto),
        execute: () => payments.create(partner, secondDto),
        responseCode: 201,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        errorCode: 1043,
        errorName: 'idempotency_conflict',
        httpStatus: 409,
      }),
    );

    expect(await db.prisma.payment.count()).toBe(1);
  });

  it('creates only one payment when two requests race with the same key', async () => {
    const partner = await createPartner(db.prisma);
    const dto = { amount: 1500, currency: 'BRL' } as CreatePaymentDto;
    const rawBody = JSON.stringify(dto);
    const run = () =>
      idempotency.run({
        partnerId: partner.id,
        key: 'race-pay-1',
        method: 'POST',
        path: '/v1/payments',
        rawBody,
        execute: () => payments.create(partner, dto),
        responseCode: 201,
      });

    const [first, second] = await Promise.all([run(), run()]);

    expect(first.id).toBe(second.id);
    expect(await db.prisma.payment.count()).toBe(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);
  });

  it('replays the same payout when the key and body match', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);
    const dto = {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'synthetic@acme.test' },
      external_id: 'payout-idem-1',
    } as CreatePayoutDto;
    const rawBody = JSON.stringify(dto);
    const params = {
      partnerId: partner.id,
      key: 'payout-1',
      method: 'POST',
      path: '/v1/payouts',
      rawBody,
      execute: () => payouts.create(partner, dto),
      responseCode: 202,
    };

    const first = await idempotency.run(params);
    const second = await idempotency.run(params);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('QUEUED');
    expect(await db.prisma.payout.count()).toBe(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id, currency: 'BRL' },
    });
    expect(balance.pending).toBe(2500n);
    expect(balance.available).toBe(2500n);
  });
});
