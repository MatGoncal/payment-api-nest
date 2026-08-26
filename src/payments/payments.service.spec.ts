import { Test, TestingModule } from '@nestjs/testing';
import { Partner } from '@prisma/client';
import { PaymentStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { FakePixProvider } from './fake-pix.provider';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  const prisma = {
    payment: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const pixProvider = new FakePixProvider();

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FakePixProvider, useValue: pixProvider },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('creates a PENDING payment with integer minor units', async () => {
    const expiresAt = new Date(Date.now() + 1800_000);
    prisma.payment.create.mockResolvedValue({
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
      providerTxId: null,
      expiresAt,
      paidAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create(partner, {
      amount: 1500,
      currency: 'BRL',
      external_id: 'order-1',
    });

    expect(result.status).toBe('PENDING');
    expect(result.amount).toBe(1500);
    expect(typeof result.amount).toBe('number');
    expect(result.qr_code).toBe('00020126');
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
  });
});
