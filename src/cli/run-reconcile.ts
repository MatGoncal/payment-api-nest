import { PrismaClient } from '@prisma/client';
import { reconcile } from './reconcile';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const { exitCode, mismatches } = await reconcile(prisma);

    for (const mismatch of mismatches) {
      process.stderr.write(
        JSON.stringify({ event: 'ledger_mismatch', ...mismatch }) + '\n',
      );
    }

    process.exitCode = exitCode;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
