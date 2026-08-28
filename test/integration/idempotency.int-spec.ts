import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Partner } from '@prisma/client';
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

function chargeResponse(status: number, id: string): Response {
  return {
    status,
    json: () =>
      Promise.resolve({
        id,
        qr_code: SYNTHETIC_QR,
        copy_paste: SYNTHETIC_QR,
      }),
  } as Response;
}

describe('idempotency keys', () => {
  const db = withTestDb();
  const queue = { add: jest.fn() } as unknown as Queue;

  let idempotency: IdempotencyService;
  let payments: PaymentsService;
  let payouts: PayoutsService;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(chargeResponse(201, 'chg_test'));

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
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(chargeResponse(201, 'chg_test'));
  });

  function paymentParams(
    partner: Partner,
    dto: CreatePaymentDto,
    key: string | undefined,
  ) {
    return {
      partnerId: partner.id,
      key,
      method: 'POST',
      path: '/v1/payments',
      rawBody: JSON.stringify(dto),
      execute: (resourceId?: string) =>
        payments.create(partner, dto, resourceId),
      responseCode: 201,
      retainResource: true as const,
    };
  }

  it('creates a payment without an Idempotency-Key', async () => {
    const partner = await createPartner(db.prisma);
    const dto = { amount: 1500, currency: 'BRL' } as CreatePaymentDto;

    const created = await idempotency.run(
      paymentParams(partner, dto, undefined),
    );

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
    const params = paymentParams(partner, dto, 'pay-1');

    const first = await idempotency.run(params);
    const second = await idempotency.run(params);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('PENDING');
    expect(await db.prisma.payment.count()).toBe(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);

    const keyRow = await db.prisma.idempotencyKey.findFirstOrThrow();
    expect(keyRow.resourceId).toBe(first.id);
  });

  it('rejects the same key with a different body as 1043', async () => {
    const partner = await createPartner(db.prisma);
    const firstDto = { amount: 1500, currency: 'BRL' } as CreatePaymentDto;
    const secondDto = { amount: 2000, currency: 'BRL' } as CreatePaymentDto;

    await idempotency.run(paymentParams(partner, firstDto, 'pay-conflict'));

    await expect(
      idempotency.run(paymentParams(partner, secondDto, 'pay-conflict')),
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
    const run = () =>
      idempotency.run(paymentParams(partner, dto, 'race-pay-1'));

    const [first, second] = await Promise.all([run(), run()]);

    expect(first.id).toBe(second.id);
    expect(await db.prisma.payment.count()).toBe(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);
  });

  it('resumes the same payment UUID after a throw past createCharge', async () => {
    const partner = await createPartner(db.prisma);
    const dto = {
      amount: 1500,
      currency: 'BRL',
      external_id: 'order-retry-charge',
    } as CreatePaymentDto;

    fetchSpy
      .mockResolvedValueOnce(chargeResponse(201, 'chg_retry'))
      .mockResolvedValueOnce(chargeResponse(200, 'chg_retry'));

    const originalCreate = db.prisma.payment.create.bind(db.prisma.payment);
    let failedOnce = false;
    const createSpy = jest
      .spyOn(db.prisma.payment, 'create')
      .mockImplementation(async (args) => {
        if (!failedOnce) {
          failedOnce = true;
          throw new Error('forced insert failure after createCharge');
        }
        return originalCreate(args as never);
      });

    try {
      await expect(
        idempotency.run(paymentParams(partner, dto, 'pay-retry-charge')),
      ).rejects.toThrow('forced insert failure after createCharge');

      expect(await db.prisma.payment.count()).toBe(0);
      expect(await db.prisma.idempotencyKey.count()).toBe(1);

      const keyRow = await db.prisma.idempotencyKey.findFirstOrThrow();
      expect(keyRow.resourceId).toBeTruthy();

      const second = await idempotency.run(
        paymentParams(partner, dto, 'pay-retry-charge'),
      );

      expect(second.id).toBe(keyRow.resourceId);
      expect(await db.prisma.payment.count()).toBe(1);

      const payment = await db.prisma.payment.findFirstOrThrow();
      expect(payment.providerChargeId).toBe('chg_retry');
      expect(payment.providerTxId).toBeNull();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const bodies = fetchSpy.mock.calls.map((call) => {
        const init = call[1] as RequestInit;
        const rawBody = init.body;
        if (typeof rawBody !== 'string') {
          throw new Error('expected string body');
        }
        return JSON.parse(rawBody) as { payment_id: string };
      });
      expect(bodies[0]?.payment_id).toBe(keyRow.resourceId);
      expect(bodies[1]?.payment_id).toBe(keyRow.resourceId);
    } finally {
      createSpy.mockRestore();
    }
  });

  it('keeps the payment idempotency key on 502 and retries with the same payment_id', async () => {
    const partner = await createPartner(db.prisma);
    const dto = {
      amount: 1500,
      currency: 'BRL',
      external_id: 'order-retry-502',
    } as CreatePaymentDto;

    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    fetchSpy.mockResolvedValueOnce(chargeResponse(200, 'chg_after_502'));

    await expect(
      idempotency.run(paymentParams(partner, dto, 'pay-retry-502')),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(await db.prisma.payment.count()).toBe(0);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);

    const keyRow = await db.prisma.idempotencyKey.findFirstOrThrow();
    expect(keyRow.resourceId).toBeTruthy();

    const second = await idempotency.run(
      paymentParams(partner, dto, 'pay-retry-502'),
    );

    expect(second.id).toBe(keyRow.resourceId);
    expect(await db.prisma.payment.count()).toBe(1);

    const payment = await db.prisma.payment.findFirstOrThrow();
    expect(payment.providerChargeId).toBe('chg_after_502');
    expect(payment.providerTxId).toBeNull();

    const retryInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    const retryRaw = retryInit.body;
    if (typeof retryRaw !== 'string') {
      throw new Error('expected string body');
    }
    const retryBody = JSON.parse(retryRaw) as {
      payment_id: string;
    };
    expect(retryBody.payment_id).toBe(keyRow.resourceId);
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

  it('deletes the payout idempotency key when create throws', async () => {
    const partner = await createPartner(db.prisma);
    const dto = {
      amount: 2500,
      currency: 'BRL',
      destination: { type: 'pix_key', value: 'synthetic@acme.test' },
    } as CreatePayoutDto;

    await expect(
      idempotency.run({
        partnerId: partner.id,
        key: 'payout-throw',
        method: 'POST',
        path: '/v1/payouts',
        rawBody: JSON.stringify(dto),
        execute: () => payouts.create(partner, dto),
        responseCode: 202,
      }),
    ).rejects.toMatchObject({ errorName: 'insufficient_balance' });

    expect(await db.prisma.payout.count()).toBe(0);
    expect(await db.prisma.idempotencyKey.count()).toBe(0);
  });
});
