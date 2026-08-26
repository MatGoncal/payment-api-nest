import { createHash, randomUUID } from 'node:crypto';
import { FxQuote, Partner, Payment, Payout } from '@prisma/client';
import { PaymentStatus, PayoutStatus } from '../../../src/common/enums';
import { PrismaService } from '../../../src/prisma/prisma.service';

export function createPartner(
  prisma: PrismaService,
  overrides: Partial<Partner> = {},
): Promise<Partner> {
  const rawKey = `pk_${randomUUID()}`;

  return prisma.partner.create({
    data: {
      id: randomUUID(),
      name: 'Integration Partner',
      apiKeyHash: createHash('sha256').update(rawKey).digest('hex'),
      apiKeyPrefix: rawKey.slice(0, 8),
      isActive: true,
      ...overrides,
    },
  });
}

export function createPayment(
  prisma: PrismaService,
  partner: Partner,
  overrides: Partial<Payment> = {},
): Promise<Payment> {
  const id = randomUUID();
  const payload = `00020126acmepay${id.replace(/-/g, '').slice(0, 16)}`;

  return prisma.payment.create({
    data: {
      id,
      partnerId: partner.id,
      status: PaymentStatus.PENDING,
      amount: 1500n,
      currency: 'BRL',
      qrCode: payload,
      copyPaste: payload,
      provider: 'fake_pix',
      expiresAt: new Date(Date.now() + 3_600_000),
      ...overrides,
    },
  });
}

export function createPayout(
  prisma: PrismaService,
  partner: Partner,
  overrides: Partial<Payout> = {},
): Promise<Payout> {
  return prisma.payout.create({
    data: {
      id: randomUUID(),
      partnerId: partner.id,
      status: PayoutStatus.QUEUED,
      amount: 1000n,
      currency: 'BRL',
      destinationType: 'pix_key',
      destinationValue: `${randomUUID()}@acme.test`,
      ...overrides,
    },
  });
}

export function createFxQuote(
  prisma: PrismaService,
  partner: Partner,
  overrides: Partial<FxQuote> = {},
): Promise<FxQuote> {
  return prisma.fxQuote.create({
    data: {
      id: randomUUID(),
      partnerId: partner.id,
      sourceCurrency: 'BRL',
      targetCurrency: 'USD',
      sourceAmount: 10_000n,
      targetAmount: 1_850n,
      rate: '0.18500000',
      expiresAt: new Date(Date.now() + 300_000),
      ...overrides,
    },
  });
}

export function fundBalance(
  prisma: PrismaService,
  partner: Partner,
  available: bigint,
  currency = 'BRL',
) {
  return prisma.partnerBalance.create({
    data: {
      id: randomUUID(),
      partnerId: partner.id,
      currency,
      available,
      pending: 0n,
    },
  });
}
