import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Partner } from '@prisma/client';
import { PaymentStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { FakePixProvider } from './fake-pix.provider';
import { PaymentsService } from './payments.service';

const SYNTHETIC_QR = '00020126ACMEPAY.FAKE.PIX.BRL.1500.0.synthetic';

describe('PaymentsService', () => {
  let service: PaymentsService;
  const prisma = {
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const pixProvider = new FakePixProvider(
    new ConfigService({
      FAKE_PIX_BASE_URL: 'http://127.0.0.1:8080',
      FAKE_PIX_API_KEY: 'fake-pix-demo',
      FAKE_PIX_CALLBACK_URL: 'http://127.0.0.1:3001/v1/webhooks/payment',
    }),
  );

  const partner = {
    id: 'partner-uuid',
    name: 'Demo',
    apiKeyHash: 'hash',
    apiKeyPrefix: 'demo-par',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies Partner;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 201,
      json: () =>
        Promise.resolve({
          id: 'chg_test',
          qr_code: SYNTHETIC_QR,
          copy_paste: SYNTHETIC_QR,
        }),
    } as Response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FakePixProvider, useValue: pixProvider },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a PENDING payment with integer minor units', async () => {
    const expiresAt = new Date(Date.now() + 1800_000);
    prisma.payment.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        expect(args.data.providerChargeId).toBe('chg_test');
        expect(args.data.providerTxId).toBeUndefined();
        return Promise.resolve({
          id: 'pay-1',
          partnerId: partner.id,
          status: PaymentStatus.PENDING,
          amount: 1500n,
          currency: 'BRL',
          externalId: 'order-1',
          description: null,
          qrCode: '00020126',
          copyPaste: '00020126',
          provider: 'fake_pix',
          providerChargeId: 'chg_test',
          providerTxId: null,
          expiresAt,
          paidAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      },
    );

    const result = await service.create(partner, {
      amount: 1500,
      currency: 'BRL',
      external_id: 'order-1',
    });

    expect(result.status).toBe('PENDING');
    expect(result.amount).toBe(1500);
    expect(typeof result.amount).toBe('number');
    expect(result.qr_code).toBe('00020126');
    expect(result).not.toHaveProperty('provider_charge_id');
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
  });

  it('uses the provided resourceId as the payment id sent to the provider', async () => {
    const resourceId = '11111111-1111-4111-8111-111111111111';
    const expiresAt = new Date(Date.now() + 1800_000);
    prisma.payment.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        expect(args.data.id).toBe(resourceId);
        expect(args.data.providerChargeId).toBe('chg_test');
        return Promise.resolve({
          id: resourceId,
          partnerId: partner.id,
          status: PaymentStatus.PENDING,
          amount: 1500n,
          currency: 'BRL',
          externalId: null,
          description: null,
          qrCode: SYNTHETIC_QR,
          copyPaste: SYNTHETIC_QR,
          provider: 'fake_pix',
          providerChargeId: 'chg_test',
          providerTxId: null,
          expiresAt,
          paidAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      },
    );

    const result = await service.create(
      partner,
      { amount: 1500, currency: 'BRL' },
      resourceId,
    );

    expect(result.id).toBe(resourceId);
    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const rawBody = init.body;
    if (typeof rawBody !== 'string') {
      throw new Error('expected string body');
    }
    const body = JSON.parse(rawBody) as { payment_id: string };
    expect(body.payment_id).toBe(resourceId);
  });

  it('lists partner payments with pagination metadata', async () => {
    const createdAt = new Date('2026-08-26T12:00:00.000Z');
    const expiresAt = new Date('2026-08-26T12:30:00.000Z');

    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        partnerId: partner.id,
        status: PaymentStatus.PAID,
        amount: 3200n,
        currency: 'BRL',
        externalId: 'order-b',
        description: null,
        qrCode: '00020126',
        copyPaste: '00020126',
        provider: 'fake_pix',
        providerTxId: null,
        expiresAt,
        paidAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    prisma.payment.count.mockResolvedValue(1);

    const result = await service.listForPartner(partner, {
      status: PaymentStatus.PAID,
      page: 1,
      per_page: 10,
    });

    expect(result.meta).toEqual({
      page: 1,
      per_page: 10,
      total: 1,
      total_pages: 1,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe('PAID');
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          partnerId: partner.id,
          status: PaymentStatus.PAID,
        },
        skip: 0,
        take: 10,
      }),
    );
  });
});
