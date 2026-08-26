import { createPartner, fundBalance } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('integration harness', () => {
  const db = withTestDb();

  it('reaches a real PostgreSQL instance', async () => {
    const rows = await db.prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS "ok"`;

    expect(rows[0].ok).toBe(1);
  });

  it('applies the migrations', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 5000n);

    const balance = await db.prisma.partnerBalance.findFirstOrThrow({
      where: { partnerId: partner.id },
    });

    expect(balance.available).toBe(5000n);
  });

  it('truncates between tests', async () => {
    expect(await db.prisma.partner.count()).toBe(0);
    expect(await db.prisma.partnerBalance.count()).toBe(0);
  });
});
