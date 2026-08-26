import { Injectable } from '@nestjs/common';
import { Partner, Payment } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DomainException } from '../common/exceptions/domain.exception';
import { LedgerDirection } from '../common/enums';
import { toMinorUnits } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';

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

  async creditPayment(payment: Payment): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.balanceLedger.findFirst({
        where: {
          referenceType: 'payment',
          referenceId: payment.id,
          direction: LedgerDirection.CREDIT,
        },
      });

      if (exists) {
        return;
      }

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
    });
  }

  async debit(
    partnerId: string,
    currency: string,
    amount: bigint,
    referenceType: string,
    referenceId: string,
    description: string,
  ) {
    return this.prisma.$transaction(async (tx) =>
      this.apply(
        tx,
        partnerId,
        currency,
        LedgerDirection.DEBIT,
        amount,
        referenceType,
        referenceId,
        description,
      ),
    );
  }

  private async apply(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    partnerId: string,
    currency: string,
    direction: LedgerDirection,
    amount: bigint,
    referenceType: string,
    referenceId: string,
    description: string,
  ) {
    if (amount <= 0n) {
      throw new DomainException(
        1015,
        'settlement_failed',
        'Amount must be a positive integer in minor units.',
        { amount: Number(amount) },
      );
    }

    let balance = await tx.partnerBalance.findFirst({
      where: { partnerId, currency },
    });

    if (!balance) {
      balance = await tx.partnerBalance.create({
        data: {
          id: randomUUID(),
          partnerId,
          currency,
          available: 0n,
          pending: 0n,
        },
      });
    }

    if (direction === LedgerDirection.DEBIT && balance.available < amount) {
      throw new DomainException(
        1027,
        'insufficient_balance',
        'Partner balance is insufficient for this debit.',
        {
          currency,
          available: toMinorUnits(balance.available),
          required: toMinorUnits(amount),
        },
      );
    }

    const next =
      direction === LedgerDirection.CREDIT
        ? balance.available + amount
        : balance.available - amount;

    const updated = await tx.partnerBalance.update({
      where: { id: balance.id },
      data: { available: next },
    });

    await tx.balanceLedger.create({
      data: {
        id: randomUUID(),
        partnerId,
        currency,
        direction,
        amount,
        balanceAfter: next,
        referenceType,
        referenceId,
        description,
      },
    });

    return updated;
  }
}
