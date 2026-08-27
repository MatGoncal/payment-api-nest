import { Prisma, PrismaClient } from '@prisma/client';
import { toMinorUnits } from '../common/utils/money.util';

export type LedgerMismatch = {
  partner_id: string;
  currency: string;
  available: number;
  pending: number;
  wallet_sum: number;
  ledger_sum: number;
  delta: number;
};

type DiffRow = {
  partner_id: string;
  currency: string;
  available: bigint;
  pending: bigint;
  wallet_sum: bigint;
  ledger_sum: bigint;
  delta: bigint;
};

export async function reconcile(
  prisma: PrismaClient,
): Promise<{ exitCode: number; mismatches: LedgerMismatch[] }> {
  const rows = await prisma.$queryRaw<DiffRow[]>(Prisma.sql`
    WITH ledger AS (
      SELECT "partner_id",
             "currency",
             COALESCE(SUM(
               CASE WHEN "direction" = 'credit' THEN "amount" ELSE -"amount" END
             ), 0) AS ledger_sum
      FROM "balance_ledger"
      GROUP BY "partner_id", "currency"
    ),
    wallets AS (
      SELECT "partner_id",
             "currency",
             "available",
             "pending",
             "available" + "pending" AS wallet_sum
      FROM "partner_balances"
    )
    SELECT COALESCE(w."partner_id", l."partner_id") AS partner_id,
           COALESCE(w."currency", l."currency") AS currency,
           COALESCE(w."available", 0) AS available,
           COALESCE(w."pending", 0) AS pending,
           COALESCE(w."wallet_sum", 0) AS wallet_sum,
           COALESCE(l."ledger_sum", 0) AS ledger_sum,
           COALESCE(w."wallet_sum", 0) - COALESCE(l."ledger_sum", 0) AS delta
    FROM wallets w
    FULL OUTER JOIN ledger l
      ON w."partner_id" = l."partner_id" AND w."currency" = l."currency"
    WHERE COALESCE(w."wallet_sum", 0) <> COALESCE(l."ledger_sum", 0)
  `);

  const mismatches = rows.map((row) => ({
    partner_id: row.partner_id,
    currency: row.currency,
    available: toMinorUnits(row.available),
    pending: toMinorUnits(row.pending),
    wallet_sum: toMinorUnits(row.wallet_sum),
    ledger_sum: toMinorUnits(row.ledger_sum),
    delta: toMinorUnits(row.delta),
  }));

  return {
    exitCode: mismatches.length === 0 ? 0 : 1,
    mismatches,
  };
}
