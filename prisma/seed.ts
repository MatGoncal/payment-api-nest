import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';

const prisma = new PrismaClient();

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function syntheticPixPayload(id: string): string {
  return `00020126acmepay${id.replace(/-/g, '').slice(0, 16)}`;
}

const DEMO_PAYMENTS = [
  { amount: 1500, status: 'PAID', external_id: 'order-101', description: 'Checkout order 101' },
  { amount: 3200, status: 'PENDING', external_id: 'order-102', description: 'PIX charge #102' },
  { amount: 8900, status: 'PAID', external_id: 'order-103', description: 'Subscription renewal' },
  { amount: 500, status: 'EXPIRED', external_id: 'order-104', description: 'Expired QR test' },
  { amount: 12500, status: 'PENDING', external_id: 'order-105', description: 'Bulk invoice' },
  { amount: 9999, status: 'PAID', external_id: 'order-106', description: 'Edge-case cents 99.99' },
  { amount: 750, status: 'FAILED', external_id: 'order-107', description: 'Provider rejection' },
  { amount: 4200, status: 'CANCELLED', external_id: 'order-108', description: 'Cancelled before pay' },
] as const;

async function main() {
  const rawKey = process.env.DEMO_PARTNER_API_KEY ?? 'demo-partner-key';

  const partner = await prisma.partner.upsert({
    where: { apiKeyHash: hashApiKey(rawKey) },
    update: {
      name: 'Demo Partner',
      apiKeyPrefix: rawKey.slice(0, 8),
      isActive: true,
    },
    create: {
      name: 'Demo Partner',
      apiKeyHash: hashApiKey(rawKey),
      apiKeyPrefix: rawKey.slice(0, 8),
      isActive: true,
    },
  });

  const now = Date.now();

  for (const sample of DEMO_PAYMENTS) {
    const id = randomUUID();
    const payload = syntheticPixPayload(id);
    const isPaid = sample.status === 'PAID';
    const isExpired = sample.status === 'EXPIRED';

    await prisma.payment.upsert({
      where: {
        partnerId_externalId: {
          partnerId: partner.id,
          externalId: sample.external_id,
        },
      },
      update: {
        status: sample.status,
        amount: BigInt(sample.amount),
        currency: 'BRL',
        description: sample.description,
        qrCode: payload,
        copyPaste: payload,
        provider: 'fake_pix',
        expiresAt: new Date(now + (isExpired ? -3_600_000 : 3_600_000)),
        paidAt: isPaid ? new Date(now - 900_000) : null,
      },
      create: {
        id,
        partnerId: partner.id,
        status: sample.status,
        amount: BigInt(sample.amount),
        currency: 'BRL',
        externalId: sample.external_id,
        description: sample.description,
        qrCode: payload,
        copyPaste: payload,
        provider: 'fake_pix',
        expiresAt: new Date(now + (isExpired ? -3_600_000 : 3_600_000)),
        paidAt: isPaid ? new Date(now - 900_000) : null,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
