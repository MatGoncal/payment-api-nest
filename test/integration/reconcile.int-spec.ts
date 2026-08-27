import { randomUUID } from 'node:crypto';
import { LedgerDirection } from '../../src/common/enums';
import { reconcile } from '../../src/cli/reconcile';
import { createPartner, fundBalance } from './helpers/fixtures';
import { withTestDb } from './helpers/test-db';

describe('ledger reconcile', () => {
  const db = withTestDb();

  it('exits 0 when a pending hold still matches the ledger net', async () => {
    const partner = await createPartner(db.prisma);
    await db.prisma.partnerBalance.create({
      data: {
        id: randomUUID(),
        partnerId: partner.id,
        currency: 'BRL',
        available: 3500n,
        pending: 1500n,
      },
    });
    await db.prisma.balanceLedger.create({
      data: {
        id: randomUUID(),
        partnerId: partner.id,
        currency: 'BRL',
        direction: LedgerDirection.CREDIT,
        amount: 5000n,
        balanceAfter: 5000n,
        referenceType: 'payment',
        referenceId: randomUUID(),
        description: 'Settlement credit',
      },
    });

    const result = await reconcile(db.prisma);

    expect(result.exitCode).toBe(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it('exits 1 and reports delta when a ledger credit has no matching wallet', async () => {
    const partner = await createPartner(db.prisma);
    await db.prisma.balanceLedger.create({
      data: {
        id: randomUUID(),
        partnerId: partner.id,
        currency: 'BRL',
        direction: LedgerDirection.CREDIT,
        amount: 1500n,
        balanceAfter: 1500n,
        referenceType: 'payment',
        referenceId: randomUUID(),
        description: 'Orphan credit',
      },
    });

    const result = await reconcile(db.prisma);

    expect(result.exitCode).toBe(1);
    expect(result.mismatches).toEqual([
      expect.objectContaining({
        partner_id: partner.id,
        currency: 'BRL',
        available: 0,
        pending: 0,
        wallet_sum: 0,
        ledger_sum: 1500,
        delta: -1500,
      }),
    ]);
  });

  it('exits 1 when available is tampered and pending is zero', async () => {
    const partner = await createPartner(db.prisma);
    await fundBalance(db.prisma, partner, 9999n);
    await db.prisma.balanceLedger.create({
      data: {
        id: randomUUID(),
        partnerId: partner.id,
        currency: 'BRL',
        direction: LedgerDirection.CREDIT,
        amount: 1500n,
        balanceAfter: 1500n,
        referenceType: 'payment',
        referenceId: randomUUID(),
        description: 'Settlement credit',
      },
    });

    const result = await reconcile(db.prisma);

    expect(result.exitCode).toBe(1);
    expect(result.mismatches[0]?.delta).toBe(8499);
  });
});
