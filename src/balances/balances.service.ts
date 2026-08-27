import { Injectable } from '@nestjs/common';
import { Partner, PartnerBalance, Payment, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DomainException } from '../common/exceptions/domain.exception';
import { LedgerDirection } from '../common/enums';
import { toMinorUnits } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Every write here takes the caller's transaction client. Opening a nested
 * `$transaction` would commit the ledger entry independently of the payment or
 * payout that justifies it, so callers own the boundary and this service never
 * starts one of its own.
 */
@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPartner(partner: Partner) {
    const rows = await this.prisma.partnerBalance.findMany({
      where: { partnerId: partner.id },
      orderBy: { currency: 'asc' },
    });

    return {
      balances: rows.map((row) => ({
        currency: row.currency,
        available: toMinorUnits(row.available),
        pending: toMinorUnits(row.pending),
      })),
    };
  }

  async creditPayment(
    tx: Prisma.TransactionClient,
    payment: Payment,
  ): Promise<void> {
    await this.apply(
      tx,
      payment.partnerId,
      payment.currency,
      LedgerDirection.CREDIT,
      payment.amount,
      'payment',
      payment.id,
      'Settlement credit',
    );
  }

  async debit(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
    amount: bigint,
    referenceType: string,
    referenceId: string,
    description: string,
  ): Promise<PartnerBalance> {
    const balance = await this.apply(
      tx,
      partnerId,
      currency,
      LedgerDirection.DEBIT,
      amount,
      referenceType,
      referenceId,
      description,
    );

    // A null result means this reference was already debited by an earlier
    // attempt of the same job, so the money moved once and this is a no-op.
    return (
      balance ??
      tx.partnerBalance.findFirstOrThrow({ where: { partnerId, currency } })
    );
  }

  /**
   * Hold funds for a queued payout. No ledger row — the money is still the
   * platform's until confirmDebit.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
    amount: bigint,
  ): Promise<PartnerBalance> {
    this.assertPositiveAmount(amount);
    await this.ensureBalanceRow(tx, partnerId, currency);

    const moved = await tx.$queryRaw<
      { available: bigint; pending: bigint }[]
    >(Prisma.sql`
      UPDATE "partner_balances"
         SET "available" = "available" - ${amount},
             "pending" = "pending" + ${amount},
             "updated_at" = NOW()
       WHERE "partner_id" = ${partnerId}::uuid
         AND "currency" = ${currency}
         AND "available" >= ${amount}
      RETURNING "available", "pending"
    `);

    if (moved.length === 0) {
      throw await this.insufficientBalance(
        tx,
        partnerId,
        currency,
        amount,
        'available',
      );
    }

    return tx.partnerBalance.findFirstOrThrow({
      where: { partnerId, currency },
    });
  }

  /**
   * Return a hold to available (payout FAILED). No ledger row.
   */
  async release(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
    amount: bigint,
  ): Promise<PartnerBalance> {
    this.assertPositiveAmount(amount);

    const moved = await tx.$queryRaw<{ pending: bigint }[]>(Prisma.sql`
      UPDATE "partner_balances"
         SET "pending" = "pending" - ${amount},
             "available" = "available" + ${amount},
             "updated_at" = NOW()
       WHERE "partner_id" = ${partnerId}::uuid
         AND "currency" = ${currency}
         AND "pending" >= ${amount}
      RETURNING "pending"
    `);

    if (moved.length === 0) {
      throw await this.insufficientBalance(
        tx,
        partnerId,
        currency,
        amount,
        'pending',
      );
    }

    return tx.partnerBalance.findFirstOrThrow({
      where: { partnerId, currency },
    });
  }

  /**
   * Consume a hold and write the ledger debit. Returns null when this
   * reference was already applied so a job replay does not touch pending.
   */
  async confirmDebit(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
    amount: bigint,
    referenceType: string,
    referenceId: string,
    description: string,
  ): Promise<PartnerBalance | null> {
    this.assertPositiveAmount(amount);
    await this.ensureBalanceRow(tx, partnerId, currency);

    const ledgerId = randomUUID();

    const claimed = await tx.$executeRaw`
      INSERT INTO "balance_ledger" (
        "id", "partner_id", "currency", "direction", "amount", "balance_after",
        "reference_type", "reference_id", "description", "created_at", "updated_at"
      )
      VALUES (
        ${ledgerId}::uuid, ${partnerId}::uuid, ${currency}, ${LedgerDirection.DEBIT},
        ${amount}, 0, ${referenceType}, ${referenceId}::uuid, ${description},
        NOW(), NOW()
      )
      ON CONFLICT ("reference_type", "reference_id", "direction") DO NOTHING
    `;

    if (claimed === 0) {
      return null;
    }

    const moved = await tx.$queryRaw<
      { available: bigint; pending: bigint }[]
    >(Prisma.sql`
      UPDATE "partner_balances"
         SET "pending" = "pending" - ${amount},
             "updated_at" = NOW()
       WHERE "partner_id" = ${partnerId}::uuid
         AND "currency" = ${currency}
         AND "pending" >= ${amount}
      RETURNING "available", "pending"
    `);

    if (moved.length === 0) {
      await tx.balanceLedger.delete({ where: { id: ledgerId } });

      throw await this.insufficientBalance(
        tx,
        partnerId,
        currency,
        amount,
        'pending',
      );
    }

    await tx.balanceLedger.update({
      where: { id: ledgerId },
      data: { balanceAfter: moved[0].available + moved[0].pending },
    });

    return tx.partnerBalance.findFirstOrThrow({
      where: { partnerId, currency },
    });
  }

  /**
   * Returns null when the reference had already been applied.
   *
   * @throws DomainException on a non-positive amount or an overdraft.
   */
  private async apply(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
    direction: LedgerDirection,
    amount: bigint,
    referenceType: string,
    referenceId: string,
    description: string,
  ): Promise<PartnerBalance | null> {
    if (amount <= 0n) {
      throw new DomainException(
        1015,
        'settlement_failed',
        'Amount must be a positive integer in minor units.',
        { amount: Number(amount) },
      );
    }

    await this.ensureBalanceRow(tx, partnerId, currency);

    // Claim the reference before touching money. The unique index is what makes
    // a replayed settlement a no-op rather than a second movement, and claiming
    // first means the duplicate path never has to undo anything.
    const ledgerId = randomUUID();

    const claimed = await tx.$executeRaw`
      INSERT INTO "balance_ledger" (
        "id", "partner_id", "currency", "direction", "amount", "balance_after",
        "reference_type", "reference_id", "description", "created_at", "updated_at"
      )
      VALUES (
        ${ledgerId}::uuid, ${partnerId}::uuid, ${currency}, ${direction}, ${amount}, 0,
        ${referenceType}, ${referenceId}::uuid, ${description}, NOW(), NOW()
      )
      ON CONFLICT ("reference_type", "reference_id", "direction") DO NOTHING
    `;

    if (claimed === 0) {
      return null;
    }

    // The guard travels with the write, so a debit can never observe a balance
    // that a concurrent transaction has already spent.
    const guard =
      direction === LedgerDirection.DEBIT
        ? Prisma.sql`AND "available" >= ${amount}`
        : Prisma.empty;

    const delta = direction === LedgerDirection.CREDIT ? amount : -amount;

    const moved = await tx.$queryRaw<{ available: bigint }[]>(Prisma.sql`
      UPDATE "partner_balances"
         SET "available" = "available" + ${delta},
             "updated_at" = NOW()
       WHERE "partner_id" = ${partnerId}::uuid
         AND "currency" = ${currency}
         ${guard}
      RETURNING "available"
    `);

    if (moved.length === 0) {
      // Give the claim back: the caller records the failure and commits, so an
      // abandoned entry would look like a debit that never happened.
      await tx.balanceLedger.delete({ where: { id: ledgerId } });

      const current = await tx.partnerBalance.findFirstOrThrow({
        where: { partnerId, currency },
      });

      throw new DomainException(
        1027,
        'insufficient_balance',
        'Partner balance is insufficient for this debit.',
        {
          currency,
          available: toMinorUnits(current.available),
          required: toMinorUnits(amount),
        },
      );
    }

    await tx.balanceLedger.update({
      where: { id: ledgerId },
      data: { balanceAfter: moved[0].available },
    });

    return tx.partnerBalance.findFirstOrThrow({
      where: { partnerId, currency },
    });
  }

  private assertPositiveAmount(amount: bigint): void {
    if (amount <= 0n) {
      throw new DomainException(
        1015,
        'settlement_failed',
        'Amount must be a positive integer in minor units.',
        { amount: Number(amount) },
      );
    }
  }

  private async insufficientBalance(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
    amount: bigint,
    column: 'available' | 'pending',
  ): Promise<DomainException> {
    const current = await tx.partnerBalance.findFirstOrThrow({
      where: { partnerId, currency },
    });

    return new DomainException(
      1027,
      'insufficient_balance',
      'Partner balance is insufficient for this debit.',
      {
        currency,
        [column]: toMinorUnits(current[column]),
        required: toMinorUnits(amount),
      },
    );
  }

  private async ensureBalanceRow(
    tx: Prisma.TransactionClient,
    partnerId: string,
    currency: string,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "partner_balances" (
        "id", "partner_id", "currency", "available", "pending",
        "created_at", "updated_at"
      )
      VALUES (
        ${randomUUID()}::uuid, ${partnerId}::uuid, ${currency}, 0, 0, NOW(), NOW()
      )
      ON CONFLICT ("partner_id", "currency") DO NOTHING
    `;
  }
}
