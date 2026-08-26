import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

async function main() {
  const rawKey = process.env.DEMO_PARTNER_API_KEY ?? 'demo-partner-key';

  await prisma.partner.upsert({
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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
